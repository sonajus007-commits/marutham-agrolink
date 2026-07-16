/* Integration test for the offline write queue, driven through the real
 * @marutham/api-client surface. jsdom ships no IndexedDB, so the store's
 * in-memory fallback is exercised here — the same public functions, minus
 * cross-reload persistence. The queue's pure decision rules are unit-tested
 * separately in packages/lib/src/offlineQueue.test.ts. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  queueWrite,
  flushQueue,
  getPendingCount,
  subscribeOffline,
  clearOfflineQueue,
  apiFetchOffline,
  OfflineQueuedError,
  ApiError,
} from '@marutham/api-client';
import type { QueuedRequest } from '@marutham/lib';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

beforeEach(async () => {
  await clearOfflineQueue();
  setOnline(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('queueWrite', () => {
  it('parks a mutation and counts it', async () => {
    await queueWrite({ method: 'PATCH', path: '/auth/me', body: { farm_lat: 10.1 } });
    expect(await getPendingCount()).toBe(1);
  });

  it('collapses two enqueues that share an idempotency key', async () => {
    await queueWrite({
      method: 'PATCH',
      path: '/auth/me',
      body: { farm_lat: 10.1 },
      key: 'farm-u1',
    });
    await queueWrite({
      method: 'PATCH',
      path: '/auth/me',
      body: { farm_lat: 10.2 },
      key: 'farm-u1',
    });
    expect(await getPendingCount()).toBe(1); // one write, not two
  });
});

describe('subscribeOffline', () => {
  it('fires immediately and on change', async () => {
    const seen: number[] = [];
    const off = subscribeOffline((n) => seen.push(n));
    await queueWrite({ method: 'POST', path: '/x' });
    // allow the async notify() microtasks to settle
    await new Promise((r) => setTimeout(r, 0));
    off();
    expect(seen[0]).toBe(0); // immediate current count
    expect(seen.at(-1)).toBe(1); // after the enqueue
  });
});

describe('flushQueue', () => {
  it('replays every parked write on success and empties the queue', async () => {
    await queueWrite({ method: 'POST', path: '/a' });
    await queueWrite({ method: 'POST', path: '/b' });
    const sent: string[] = [];
    const summary = await flushQueue(async (e: QueuedRequest) => {
      sent.push(e.path);
      return 200;
    });
    expect(summary.flushed).toBe(2);
    expect(summary.remaining).toBe(0);
    expect(sent).toEqual(['/a', '/b']); // oldest first
  });

  it('stops and keeps the rest parked when the network is still gone', async () => {
    await queueWrite({ method: 'POST', path: '/a' });
    await queueWrite({ method: 'POST', path: '/b' });
    const summary = await flushQueue(async () => null); // null = never reached the server
    expect(summary.flushed).toBe(0);
    expect(summary.remaining).toBe(2); // nothing lost
  });

  it('drops a write the server rejects for good (4xx)', async () => {
    await queueWrite({ method: 'POST', path: '/bad' });
    const summary = await flushQueue(async () => 400);
    expect(summary.dropped).toBe(1);
    expect(summary.remaining).toBe(0); // gone — replaying a 400 will never succeed
  });

  it('keeps a write on a transient 500, then lands it on the next flush', async () => {
    await queueWrite({ method: 'POST', path: '/flaky' });
    const first = await flushQueue(async () => 500);
    expect(first.remaining).toBe(1); // retried, not dropped
    const second = await flushQueue(async () => 200);
    expect(second.flushed).toBe(1);
    expect(second.remaining).toBe(0);
  });
});

describe('apiFetchOffline', () => {
  it('parks the write and throws OfflineQueuedError when the device is offline', async () => {
    setOnline(false);
    await expect(
      apiFetchOffline('PATCH', '/auth/me', { farm_lat: 10.1 }, { key: 'farm-u1' }),
    ).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(await getPendingCount()).toBe(1);
  });

  it('parks the write when the request fails at the network layer while "online"', async () => {
    setOnline(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetchOffline('POST', '/orders')).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(await getPendingCount()).toBe(1);
  });

  it('re-throws a real server error (ApiError) and does NOT park it', async () => {
    setOnline(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'bad request' }),
      }),
    );
    await expect(apiFetchOffline('POST', '/orders', {})).rejects.toBeInstanceOf(ApiError);
    expect(await getPendingCount()).toBe(0); // a server "no" is not an offline case
  });

  it('passes a GET straight through without ever queuing it', async () => {
    setOnline(true);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) }),
    );
    const out = await apiFetchOffline<{ ok: boolean }>('GET', '/products');
    expect(out.ok).toBe(true);
    expect(await getPendingCount()).toBe(0);
  });
});
