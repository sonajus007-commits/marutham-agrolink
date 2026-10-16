import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  apiFetch,
  ApiError,
  isTimeoutError,
  onSessionExpired,
  subscribeSlowNetwork,
  setSession,
  getToken,
  READ_TIMEOUT_MS,
  SLOW_AFTER_MS,
  type User,
} from '@marutham/api-client';

/* The api-client's three app-wide states: an expired session (401 on a request
 * that carried a token), a slow request, and a timed-out one. */

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fetch that never answers on its own — only the abort signal ends it. */
function hangingFetch() {
  return vi.fn(
    (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
  );
}

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('session expired', () => {
  it('a 401 on an authenticated call clears the session and notifies', async () => {
    setSession('tok', { id: 'u1' } as User);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(401, { error: 'Token invalid or expired.' })),
    );
    const heard = vi.fn();
    const off = onSessionExpired(heard);
    await expect(apiFetch('GET', '/orders')).rejects.toBeInstanceOf(ApiError);
    off();
    expect(heard).toHaveBeenCalledWith('Token invalid or expired.');
    expect(getToken()).toBeNull();
  });

  it('a 401 on an unauthenticated call (wrong password) is only that call’s error', async () => {
    setSession('tok', { id: 'u1' } as User);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { error: 'Invalid credentials' })));
    const heard = vi.fn();
    const off = onSessionExpired(heard);
    await expect(apiFetch('POST', '/auth/login', {}, false)).rejects.toThrow('Invalid credentials');
    off();
    expect(heard).not.toHaveBeenCalled();
    expect(getToken()).toBe('tok');
  });

  it('a 403 does not end the session', async () => {
    setSession('tok', { id: 'u1' } as User);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(403, { error: 'Access denied.' })));
    await expect(apiFetch('GET', '/admin/x')).rejects.toThrow('Access denied.');
    expect(getToken()).toBe('tok');
  });
});

describe('slow network + timeout', () => {
  it('flags a slow request, then times it out as a 408 ApiError', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hangingFetch());
    const slow: boolean[] = [];
    const off = subscribeSlowNetwork((s) => slow.push(s));

    const p = apiFetch('GET', '/orders').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(SLOW_AFTER_MS + 1);
    expect(slow.at(-1)).toBe(true);

    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS);
    const err = await p;
    expect(isTimeoutError(err)).toBe(true);
    expect(slow.at(-1)).toBe(false); // settled → no longer slow
    off();
  });

  it('a genuine network failure is NOT turned into a timeout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await apiFetch('GET', '/orders').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(isTimeoutError(err)).toBe(false);
  });
});
