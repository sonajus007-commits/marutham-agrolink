/* Offline write queue — the pure decision core.
 *
 * When a mutation is made with no connectivity (the PWA on a phone, or the
 * Capacitor webview in a dead zone), it is parked in a queue and replayed once
 * the network returns. This module is the DOM-free, storage-free brain of that
 * queue: what may be queued, how to avoid queuing the same action twice, and —
 * when a replay comes back — whether to consider it done, retry it, or give up.
 *
 * Deliberately no IndexedDB, no fetch, no timers here — those live in the
 * api-client glue (offlineStore / offlineSync). Keeping the rules pure means they
 * are unit-tested without a browser and stay portable to React Native, exactly
 * like table.ts and calendar.ts. */

/** HTTP methods a request can carry. Only the mutating ones are ever queued. */
export type QueueMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** A parked write, as stored and replayed. `key` is the caller's idempotency
 *  key: two enqueues with the same key collapse to one, so a double-tap or a
 *  retry loop cannot bank the same mutation twice. */
export interface QueuedRequest {
  id: string;
  method: QueueMethod;
  path: string;
  body?: unknown;
  key?: string;
  createdAt: number;
  attempts: number;
}

/** After a replay attempt, what to do with the entry.
 *  - done:  the server accepted it (2xx) — remove it.
 *  - drop:  the server rejected it for good (a 4xx that will never succeed on
 *           replay, e.g. a validation error) — remove it, it is not coming back.
 *  - retry: a transient failure (5xx, 408, 429) — keep it, count the attempt.
 *  - offline: no response at all (still no network) — keep it untouched and stop
 *           flushing; there is no point trying the rest of the queue. */
export type ReplayDecision = 'done' | 'drop' | 'retry' | 'offline';

/** Give up on an entry after this many failed replay attempts, so a permanently
 *  poisoned request cannot wedge the queue forever. */
export const MAX_ATTEMPTS = 8;

/** Reads are never queued — a stale read has no value, and replaying it changes
 *  nothing. Only mutations are worth parking. */
export function isQueueableMethod(method: string): boolean {
  return method === 'POST' || method === 'PATCH' || method === 'PUT' || method === 'DELETE';
}

/** True when an entry with this idempotency key is already parked. A caller that
 *  passes no key opts out of dedup (every enqueue is distinct). */
export function isDuplicate(queue: QueuedRequest[], key: string | undefined): boolean {
  if (!key) return false;
  return queue.some((q) => q.key === key);
}

/**
 * Classify a replay result into a decision.
 * @param status  the HTTP status the replay returned, or `null` when the request
 *                never reached the server (offline / network error).
 */
export function classifyReplay(status: number | null): ReplayDecision {
  if (status === null) return 'offline'; // never left the device
  if (status >= 200 && status < 300) return 'done';
  // Transient: server hiccup, timeout, or rate-limit — worth another go later.
  if (status >= 500 || status === 408 || status === 429) return 'retry';
  // Any other 4xx is the server saying "no" in a way replaying won't fix.
  return 'drop';
}

/**
 * Apply a decision to the queue, returning a NEW array (never mutated in place).
 * `retry` increments the attempt count, and an entry that has exhausted
 * MAX_ATTEMPTS is dropped rather than retried forever.
 */
export function applyDecision(
  queue: QueuedRequest[],
  id: string,
  decision: ReplayDecision,
): QueuedRequest[] {
  if (decision === 'offline') return queue; // untouched — we stopped flushing
  if (decision === 'done' || decision === 'drop') {
    return queue.filter((q) => q.id !== id);
  }
  // retry: bump attempts, and evict if it has tried too many times.
  return queue.flatMap((q) => {
    if (q.id !== id) return [q];
    const attempts = q.attempts + 1;
    return attempts >= MAX_ATTEMPTS ? [] : [{ ...q, attempts }];
  });
}

/** Flushing stops the moment a replay comes back `offline` — the network is gone
 *  again, so the rest of the queue would only pile up more failed attempts. */
export function shouldStopFlush(decision: ReplayDecision): boolean {
  return decision === 'offline';
}

/** Replay order: oldest first, so mutations land in the sequence the user made
 *  them (a create before the edit that depends on it). */
export function inReplayOrder(queue: QueuedRequest[]): QueuedRequest[] {
  return [...queue].sort((a, b) => a.createdAt - b.createdAt);
}
