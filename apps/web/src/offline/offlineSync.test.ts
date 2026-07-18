/* Integration test for the offline write queue, driven through the real
 * @marutham/api-client surface. jsdom ships no IndexedDB, so the store's
 * in-memory fallback is exercised here — the same public functions, minus
 * cross-reload persistence. The queue's pure decision rules are unit-tested
 * separately in packages/lib/src/offlineQueue.test.ts. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  api,
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

  it('replace:true keeps the LATEST same-key write (a re-pin supersedes the earlier one)', async () => {
    await queueWrite({
      method: 'PATCH',
      path: '/auth/me',
      body: { farm_lat: 1 },
      key: 'farm-u1',
      replace: true,
    });
    await queueWrite({
      method: 'PATCH',
      path: '/auth/me',
      body: { farm_lat: 2 },
      key: 'farm-u1',
      replace: true,
    });
    expect(await getPendingCount()).toBe(1);
    // the surviving entry carries the latest value, not the first
    const summary = await flushQueue(async (e: QueuedRequest) => {
      expect((e.body as { farm_lat: number }).farm_lat).toBe(2);
      return 200;
    });
    expect(summary.flushed).toBe(1);
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

/* Queued scans — the field actions (VCO verify, hub dispatch, delivery).
 *
 * A scan advances an order one step from wherever it currently is, so unlike the
 * farm pin (an absolute "set lat to X") it is only safe to park if the write states
 * which stage it was made at. These cover that contract end to end. */
describe('queued scans', () => {
  function bodies(sent: QueuedRequest[]): Record<string, unknown>[] {
    return sent.map((e) => e.body as Record<string, unknown>);
  }

  it('parks a delivery scan carrying the stage it was made at', async () => {
    setOnline(false);
    await expect(api.deliverOffline('o1', 4, { lat: 10.5, lng: 78.8 })).rejects.toBeInstanceOf(
      OfflineQueuedError,
    );
    expect(await getPendingCount()).toBe(1);

    const sent: QueuedRequest[] = [];
    await flushQueue(async (e) => {
      sent.push(e);
      return 200;
    });
    expect(sent[0].path).toBe('/orders/o1/scan');
    expect(bodies(sent)[0]).toEqual({ lat: 10.5, lng: 78.8, from_stage: 4 });
  });

  it('carries the VCO’s route and agent choice into the parked write', async () => {
    setOnline(false);
    await expect(
      api.verifyOrderOffline('o1', 1, { route: 'hub', agent_id: 'a9' }),
    ).rejects.toBeInstanceOf(OfflineQueuedError);

    const sent: QueuedRequest[] = [];
    await flushQueue(async (e) => {
      sent.push(e);
      return 200;
    });
    expect(bodies(sent)[0]).toEqual({ route: 'hub', agent_id: 'a9', from_stage: 1 });
  });

  it('collapses a double-tap at the same stage into one write', async () => {
    setOnline(false);
    await expect(api.deliverOffline('o1', 4)).rejects.toBeInstanceOf(OfflineQueuedError);
    await expect(api.deliverOffline('o1', 4)).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(await getPendingCount()).toBe(1); // one delivery, not two
  });

  it('keeps two different transitions on one order and replays them oldest first', async () => {
    // A VCO with no signal verifies, then picks up: two real steps, both parked. Each
    // asserts the stage the previous one leaves behind, so the chain lands in order.
    setOnline(false);
    await expect(api.verifyOrderOffline('o1', 1, { route: 'direct' })).rejects.toBeInstanceOf(
      OfflineQueuedError,
    );
    await expect(api.deliverOffline('o1', 2)).rejects.toBeInstanceOf(OfflineQueuedError);
    expect(await getPendingCount()).toBe(2);

    const sent: QueuedRequest[] = [];
    await flushQueue(async (e) => {
      sent.push(e);
      return 200;
    });
    expect(bodies(sent).map((b) => b.from_stage)).toEqual([1, 2]);
  });

  it('drops a scan the server refuses as stale (409) rather than retrying it', async () => {
    // The order moved on while the write sat in the queue. 409 is final: replaying it
    // would only advance the order from a stage the actor never saw.
    setOnline(false);
    await expect(api.deliverOffline('o1', 4)).rejects.toBeInstanceOf(OfflineQueuedError);
    const summary = await flushQueue(async () => 409);
    expect(summary.dropped).toBe(1);
    expect(summary.remaining).toBe(0);
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
