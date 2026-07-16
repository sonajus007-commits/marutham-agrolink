import { describe, it, expect } from 'vitest';
import {
  isQueueableMethod,
  isDuplicate,
  classifyReplay,
  applyDecision,
  shouldStopFlush,
  inReplayOrder,
  MAX_ATTEMPTS,
  type QueuedRequest,
} from './offlineQueue';

const entry = (over: Partial<QueuedRequest> = {}): QueuedRequest => ({
  id: 'a',
  method: 'POST',
  path: '/x',
  createdAt: 1,
  attempts: 0,
  ...over,
});

describe('isQueueableMethod', () => {
  it('queues only mutating methods', () => {
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) expect(isQueueableMethod(m)).toBe(true);
    expect(isQueueableMethod('GET')).toBe(false); // a stale read is worthless
  });
});

describe('isDuplicate', () => {
  it('collapses two enqueues that share an idempotency key', () => {
    const q = [entry({ id: 'a', key: 'pin-farm-u1' })];
    expect(isDuplicate(q, 'pin-farm-u1')).toBe(true);
    expect(isDuplicate(q, 'pin-farm-u2')).toBe(false);
  });
  it('treats a keyless enqueue as always distinct', () => {
    expect(isDuplicate([entry({ key: undefined })], undefined)).toBe(false);
  });
});

describe('classifyReplay', () => {
  it('null (never reached the server) is offline', () => {
    expect(classifyReplay(null)).toBe('offline');
  });
  it('2xx is done', () => {
    expect(classifyReplay(200)).toBe('done');
    expect(classifyReplay(201)).toBe('done');
  });
  it('5xx / 408 / 429 are transient retries', () => {
    expect(classifyReplay(500)).toBe('retry');
    expect(classifyReplay(503)).toBe('retry');
    expect(classifyReplay(408)).toBe('retry');
    expect(classifyReplay(429)).toBe('retry');
  });
  it('other 4xx is a permanent drop', () => {
    expect(classifyReplay(400)).toBe('drop');
    expect(classifyReplay(403)).toBe('drop');
    expect(classifyReplay(409)).toBe('drop');
  });
});

describe('applyDecision', () => {
  it('done removes the entry', () => {
    const q = [entry({ id: 'a' }), entry({ id: 'b' })];
    expect(applyDecision(q, 'a', 'done').map((e) => e.id)).toEqual(['b']);
  });
  it('drop removes the entry', () => {
    const q = [entry({ id: 'a' }), entry({ id: 'b' })];
    expect(applyDecision(q, 'b', 'drop').map((e) => e.id)).toEqual(['a']);
  });
  it('offline leaves the queue untouched', () => {
    const q = [entry({ id: 'a' })];
    expect(applyDecision(q, 'a', 'offline')).toEqual(q);
  });
  it('retry increments attempts without removing', () => {
    const q = [entry({ id: 'a', attempts: 2 })];
    const next = applyDecision(q, 'a', 'retry');
    expect(next).toHaveLength(1);
    expect(next[0].attempts).toBe(3);
  });
  it('retry evicts an entry that has exhausted MAX_ATTEMPTS', () => {
    const q = [entry({ id: 'a', attempts: MAX_ATTEMPTS - 1 })];
    expect(applyDecision(q, 'a', 'retry')).toEqual([]); // poison request cannot wedge the queue
  });
  it('does not mutate the input array', () => {
    const q = [entry({ id: 'a', attempts: 0 })];
    applyDecision(q, 'a', 'retry');
    expect(q[0].attempts).toBe(0);
  });
});

describe('shouldStopFlush', () => {
  it('stops only when a replay came back offline', () => {
    expect(shouldStopFlush('offline')).toBe(true);
    for (const d of ['done', 'drop', 'retry'] as const) expect(shouldStopFlush(d)).toBe(false);
  });
});

describe('inReplayOrder', () => {
  it('replays oldest first so dependent mutations keep their order', () => {
    const q = [
      entry({ id: 'new', createdAt: 30 }),
      entry({ id: 'old', createdAt: 10 }),
      entry({ id: 'mid', createdAt: 20 }),
    ];
    expect(inReplayOrder(q).map((e) => e.id)).toEqual(['old', 'mid', 'new']);
  });
  it('does not mutate the input', () => {
    const q = [entry({ id: 'b', createdAt: 2 }), entry({ id: 'a', createdAt: 1 })];
    inReplayOrder(q);
    expect(q.map((e) => e.id)).toEqual(['b', 'a']);
  });
});
