/* Offline write queue — orchestration.
 *
 * Ties the pure rules (@marutham/lib offlineQueue) to durable storage
 * (offlineStore) and the real network (apiFetch). Three jobs:
 *
 *   1. queueWrite / apiFetchOffline — park a mutation that cannot go out now.
 *   2. flushQueue — replay parked mutations, oldest first, deciding done/retry/
 *      drop from the status each replay returns. Stops the moment the network is
 *      gone again.
 *   3. startOfflineSync — flush automatically when the browser (or the Capacitor
 *      webview) reports it is back online, and once on startup.
 *
 * Auth is re-read on every replay (apiFetch reads the token per call), so a
 * mutation queued before a token refresh still goes out with a valid one. This is
 * app-level on purpose, not a service-worker Background Sync: the Capacitor native
 * shell has NO service worker, and the native shell is the whole point. */
import {
  isQueueableMethod,
  classifyReplay,
  applyDecision,
  shouldStopFlush,
  inReplayOrder,
  type QueuedRequest,
  type QueueMethod,
} from '@marutham/lib';
import { apiFetch, ApiError } from './client';
import { storeAdd, storeAll, storeReplace, storeClear } from './offlineStore';

/** Thrown by apiFetchOffline when a write could not be sent and was parked
 *  instead. Callers catch it to tell the user "saved — will sync", distinct from
 *  a real ApiError the server returned. */
export class OfflineQueuedError extends Error {
  readonly queued = true;
  readonly entry: QueuedRequest;
  constructor(entry: QueuedRequest) {
    super('Saved on your device — it will sync when you are back online.');
    this.name = 'OfflineQueuedError';
    this.entry = entry;
  }
}

// ── pending-count subscribers (for a UI badge) ────────────────────────────────
const listeners = new Set<(count: number) => void>();
async function notify(): Promise<void> {
  const count = (await storeAll()).length;
  for (const cb of listeners) cb(count);
}

/** Subscribe to the pending-write count. Fires immediately with the current
 *  count, and on every enqueue/flush change. Returns an unsubscribe. */
export function subscribeOffline(cb: (count: number) => void): () => void {
  listeners.add(cb);
  void storeAll().then((q) => cb(q.length));
  return () => listeners.delete(cb);
}

/** How many writes are waiting to sync. */
export async function getPendingCount(): Promise<number> {
  return (await storeAll()).length;
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Park a mutation. When a `key` is given, two behaviours are available for a write
 * whose key is already parked:
 *   - default (`replace` false): collapse — the existing entry is kept and returned,
 *     so a double-tap on a create cannot bank it twice.
 *   - `replace: true`: supersede — the stale same-key entry is evicted and this one
 *     takes its place, so the LATEST value wins. Use this for set-a-value mutations
 *     (a farm pin, an address edit) where only the final state matters.
 */
export async function queueWrite(req: {
  method: QueueMethod;
  path: string;
  body?: unknown;
  key?: string;
  replace?: boolean;
}): Promise<QueuedRequest> {
  const existing = await storeAll();
  if (req.key && !req.replace) {
    const dup = existing.find((q) => q.key === req.key);
    if (dup) return dup;
  }
  const entry: QueuedRequest = {
    id: newId(),
    method: req.method,
    path: req.path,
    body: req.body,
    key: req.key,
    createdAt: Date.now(),
    attempts: 0,
  };
  if (req.key && req.replace) {
    // keep-latest: drop any same-key entry, this write supersedes it
    await storeReplace([...existing.filter((q) => q.key !== req.key), entry]);
  } else {
    await storeAdd(entry);
  }
  void notify();
  return entry;
}

// One replay against the live API, mapped to a status the rules understand.
// A server response (even an error) yields its status; a network failure yields
// null, which the rules read as "still offline".
async function sendOnce(entry: QueuedRequest): Promise<number | null> {
  try {
    await apiFetch(entry.method, entry.path, entry.body);
    return 200;
  } catch (e) {
    if (e instanceof ApiError) return e.status;
    return null;
  }
}

export interface FlushSummary {
  flushed: number;
  dropped: number;
  remaining: number;
}

let flushing = false;

/**
 * Replay the queue, oldest first. Single-flight: a second call while one is in
 * progress is a no-op that reports the current remaining count. `send` is
 * injectable for tests; production uses the real API.
 */
export async function flushQueue(
  send: (entry: QueuedRequest) => Promise<number | null> = sendOnce,
): Promise<FlushSummary> {
  if (flushing) return { flushed: 0, dropped: 0, remaining: (await storeAll()).length };
  flushing = true;
  let flushed = 0;
  let dropped = 0;
  try {
    const ordered = inReplayOrder(await storeAll());
    for (const entry of ordered) {
      const decision = classifyReplay(await send(entry));
      if (shouldStopFlush(decision)) break; // network gone again — leave the rest parked
      await storeReplace(applyDecision(await storeAll(), entry.id, decision));
      if (decision === 'done') flushed++;
      else if (decision === 'drop') dropped++;
      void notify();
    }
  } finally {
    flushing = false;
    void notify();
  }
  return { flushed, dropped, remaining: (await storeAll()).length };
}

/**
 * apiFetch for a mutation that should survive being offline. If the device is
 * offline, or the request fails at the network layer, the write is parked and an
 * OfflineQueuedError is thrown for the UI to surface. A real server error
 * (ApiError) is re-thrown unchanged — the caller handles it as it always did.
 * GET is never queued: it falls straight through to apiFetch.
 */
export async function apiFetchOffline<T = unknown>(
  method: QueueMethod,
  path: string,
  body?: unknown,
  opts: { key?: string; replace?: boolean } = {},
): Promise<T> {
  if (!isQueueableMethod(method)) return apiFetch<T>(method, path, body);

  const park = () => queueWrite({ method, path, body, key: opts.key, replace: opts.replace });

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) {
    throw new OfflineQueuedError(await park());
  }
  try {
    return await apiFetch<T>(method, path, body);
  } catch (e) {
    if (e instanceof ApiError) throw e; // the server answered — not an offline case
    throw new OfflineQueuedError(await park());
  }
}

/**
 * Discard every parked write. Call this on sign-out: a mutation queued by one
 * user must never replay under the next user's token. Also the "discard pending"
 * action if you surface the queue in the UI.
 */
export async function clearOfflineQueue(): Promise<void> {
  await storeClear();
  void notify();
}

let started = false;
/**
 * Begin auto-syncing: flush when the browser fires `online`, and once now if we
 * are already online. Idempotent, and a no-op outside a browser/webview. Call it
 * once at app startup. The Capacitor webview fires the same `online` event, so no
 * plugin wiring is needed — but a native caller can also invoke flushQueue()
 * directly from the Capacitor Network listener for a faster signal.
 */
export function startOfflineSync(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => {
    void flushQueue();
  });
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    void flushQueue();
  }
}
