/* Core fetch wrapper — typed port of frontend/js/api.js `apiFetch`.
 * Base URL is relative (same origin as the page), matching the legacy
 * config.js. In dev, Vite proxies /api to the backend.
 *
 * The API lives under /api. It used to sit at the root, but the root is the
 * public marketplace's SEO surface (a product page must be able to live at
 * /products/…), so the API moved. Callers still pass root-relative paths —
 * apiFetch('GET', '/orders') — and this prefixes them; nothing else in the app
 * should know the prefix exists. */
import { getToken, clearSession } from './session';

let API_BASE = '/api';

export function setApiBase(base: string): void {
  API_BASE = base;
}

export class ApiError extends Error {
  status: number;
  /** The parsed JSON error body, so callers can read fields beyond `error`
   *  (e.g. the login lifecycle's `password_action`). */
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/* ── Request time limits ──
 * Without one, a request on a dead-but-"connected" network (one bar in a field)
 * spins forever. Reads give up sooner than writes: a write may carry photos and
 * is the thing the user cannot afford to lose. A timeout throws an ApiError with
 * status 408 — deliberately an ApiError, so apiFetchOffline does NOT park it: the
 * write may already have reached the server, and silently replaying it could
 * apply it twice. The user is told to retry instead; the offline queue's replay
 * rules already treat 408 as "retry later". */
export const READ_TIMEOUT_MS = 20_000;
export const WRITE_TIMEOUT_MS = 60_000;
/** How long a request runs before the UI says "slow connection". */
export const SLOW_AFTER_MS = 5_000;
export const TIMEOUT_STATUS = 408;

/* ── Slow-network signal ──
 * Counts requests that have been in flight longer than SLOW_AFTER_MS. Listeners
 * get true while at least one is slow, false once they have all settled. */
let slowCount = 0;
const slowListeners = new Set<(slow: boolean) => void>();
function setSlow(delta: number): void {
  const was = slowCount > 0;
  slowCount = Math.max(0, slowCount + delta);
  const now = slowCount > 0;
  if (was !== now) slowListeners.forEach((fn) => fn(now));
}
export function subscribeSlowNetwork(fn: (slow: boolean) => void): () => void {
  slowListeners.add(fn);
  fn(slowCount > 0);
  return () => slowListeners.delete(fn);
}

/* ── Session-expired signal ──
 * A 401 on a request that CARRIED a token means the session is no longer valid
 * (expired, revoked, account removed). The session is cleared here, once, and
 * listeners (AuthContext) send the user to sign in with an explanation. A 401 on
 * an unauthenticated call (wrong password at login) is just that call's error. */
const expiredListeners = new Set<(message: string) => void>();
export function onSessionExpired(fn: (message: string) => void): () => void {
  expiredListeners.add(fn);
  return () => expiredListeners.delete(fn);
}

/** fetch with a time limit and slow-request tracking. */
async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  let slow = false;
  const slowTimer = setTimeout(() => {
    slow = true;
    setSlow(1);
  }, SLOW_AFTER_MS);
  const killTimer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) {
      throw new ApiError(
        'The connection is too slow — the request timed out. Please try again.',
        TIMEOUT_STATUS,
        { error: 'timeout' },
      );
    }
    throw e; // a genuine network failure (offline) — callers/queue handle it
  } finally {
    clearTimeout(slowTimer);
    clearTimeout(killTimer);
    if (slow) setSlow(-1);
  }
}

function checkExpired(res: Response, sentToken: boolean, data: unknown): void {
  if (res.status !== 401 || !sentToken) return;
  clearSession();
  const err =
    data && typeof data === 'object' && 'error' in data
      ? (data as { error?: unknown }).error
      : null;
  const msg = err ? String(err) : 'Your session has expired.';
  expiredListeners.forEach((fn) => fn(msg));
}

/** True when an error is a request timeout raised by apiFetch. */
export function isTimeoutError(e: unknown): boolean {
  return e instanceof ApiError && e.status === TIMEOUT_STATUS;
}

export async function apiFetch<T = unknown>(
  method: Method,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = auth ? getToken() : null;
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await timedFetch(
    API_BASE + path,
    { method, headers, body: body != null ? JSON.stringify(body) : undefined },
    method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS,
  );

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    /* empty / non-JSON body */
  }

  if (!res.ok) {
    checkExpired(res, Boolean(token), data);
    const msg =
      (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) ||
      `Request failed (${res.status})`;
    throw new ApiError(String(msg), res.status, data);
  }
  return data as T;
}

/**
 * GET a binary response (e.g. a generated PDF) as a Blob, carrying auth. The plain
 * apiFetch always parses JSON, which a PDF body is not — so file endpoints use this.
 * An error response IS JSON, so its `error` is read back out for the thrown message.
 */
export async function apiFetchBlob(path: string): Promise<Blob> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await timedFetch(API_BASE + path, { method: 'GET', headers }, WRITE_TIMEOUT_MS);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    let data: unknown = null;
    try {
      data = await res.json();
      if (data && typeof data === 'object' && 'error' in data)
        msg = String((data as { error?: unknown }).error);
    } catch {
      /* non-JSON error body — keep the status message */
    }
    checkExpired(res, Boolean(token), data);
    throw new ApiError(msg, res.status);
  }
  return res.blob();
}
