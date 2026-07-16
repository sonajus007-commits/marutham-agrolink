/* Durable storage for the offline write queue.
 *
 * IndexedDB so a queued mutation survives a reload, a tab close, or the phone
 * going to sleep in a dead zone — localStorage would work too, but IndexedDB
 * holds structured bodies without a JSON round-trip and has real headroom.
 *
 * Falls back to an in-memory array wherever IndexedDB is absent: SSR, unit tests
 * (jsdom ships no IndexedDB), and the odd locked-down webview. The queue still
 * works within the session; it just does not persist across a reload there. The
 * public functions are identical in both modes, so nothing above this file cares
 * which is in play. */
import type { QueuedRequest } from '@marutham/lib';

const DB_NAME = 'marutham-offline';
const STORE = 'writes';
const VERSION = 1;

const hasIDB = (): boolean => typeof indexedDB !== 'undefined' && indexedDB !== null;

// ── in-memory fallback ────────────────────────────────────────────────────────
let mem: QueuedRequest[] = [];

// ── IndexedDB ─────────────────────────────────────────────────────────────────
let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ── public API (mode-agnostic) ────────────────────────────────────────────────

/** Persist a new queued request. */
export async function storeAdd(entry: QueuedRequest): Promise<void> {
  if (!hasIDB()) {
    mem = [...mem, entry];
    return;
  }
  await run('readwrite', (s) => s.add(entry));
}

/** Every queued request, unordered. Ordering is applied by the caller (oldest
 *  first) so the storage layer stays dumb. */
export async function storeAll(): Promise<QueuedRequest[]> {
  if (!hasIDB()) return [...mem];
  return run<QueuedRequest[]>('readonly', (s) => s.getAll() as IDBRequest<QueuedRequest[]>);
}

/** Replace the whole queue with `entries` (clear + bulk add). Used to persist the
 *  post-replay state in one shot after a decision is applied. */
export async function storeReplace(entries: QueuedRequest[]): Promise<void> {
  if (!hasIDB()) {
    mem = [...entries];
    return;
  }
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const e of entries) store.add(e);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Empty the queue. */
export async function storeClear(): Promise<void> {
  if (!hasIDB()) {
    mem = [];
    return;
  }
  await run('readwrite', (s) => s.clear());
}
