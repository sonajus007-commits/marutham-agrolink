import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  api,
  ApiError,
  getToken,
  getUser,
  setSession,
  clearSession,
  onSessionExpired,
  flushQueue,
  clearOfflineQueue,
  type User,
} from '@marutham/api-client';
import { enablePushForSession, disablePushForSession } from '../native/push';

/* Session-expired hand-off to the login screen. Set when an authenticated request
 * comes back 401; Login reads it once to explain why the user is there. */
const EXPIRED_KEY = 'ma_session_expired';
export function hasSessionExpiredNotice(): boolean {
  try {
    return sessionStorage.getItem(EXPIRED_KEY) === '1';
  } catch {
    return false;
  }
}
export function clearSessionExpiredNotice(): void {
  try {
    sessionStorage.removeItem(EXPIRED_KEY);
  } catch {
    /* best-effort */
  }
}

/* Whose parked offline writes are in the queue. Parked work survives a session
 * expiry (the same agent signs back in and it syncs), but must never replay under
 * a DIFFERENT user's token — so a sign-in by someone else discards it. */
const QUEUE_OWNER_KEY = 'ma_queue_owner';
async function claimOfflineQueue(user: User): Promise<void> {
  try {
    const owner = localStorage.getItem(QUEUE_OWNER_KEY);
    if (owner && owner !== String(user.id)) await clearOfflineQueue();
    localStorage.setItem(QUEUE_OWNER_KEY, String(user.id));
  } catch {
    /* storage blocked — nothing parked can be trusted to an owner either */
  }
  void flushQueue();
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (phone: string, password: string) => Promise<User>;
  /** OTP login — verifies a code from api.sendOtp and starts a session. */
  loginWithOtp: (phone: string, otp: string) => Promise<User>;
  logout: () => void;
  /** Persist an updated user record (e.g. after a profile edit). */
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getUser());
  const [loading, setLoading] = useState<boolean>(() => Boolean(getToken()));

  // On mount, if a token exists (possibly set by a legacy page), verify it and
  // refresh the user record from the backend.
  useEffect(() => {
    let active = true;
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((res) => {
        if (!active) return;
        setUser(res.user);
        void claimOfflineQueue(res.user);
        // Session restored from a stored token (e.g. app relaunch) — re-register this
        // device for push. No-op in the browser.
        void enablePushForSession();
      })
      .catch((err) => {
        if (!active) return;
        // Only a server that REJECTS the token ends the session. A network failure
        // or timeout (field agent opening the app with no signal) keeps the cached
        // user so the offline-capable screens still work.
        if (err instanceof ApiError && err.status === 401) {
          clearSession();
          setUser(null);
        }
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Any authenticated request that comes back 401 (the API client has already
  // cleared the stored session) drops the user to the login screen with a notice.
  useEffect(
    () =>
      onSessionExpired(() => {
        try {
          sessionStorage.setItem(EXPIRED_KEY, '1');
        } catch {
          /* notice is best-effort */
        }
        setUser(null);
      }),
    [],
  );

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async login(phone, password) {
        const res = await api.login(phone, password);
        setSession(res.token, res.user);
        setUser(res.user);
        void claimOfflineQueue(res.user);
        void enablePushForSession(); // register this device for push (no-op in browser)
        return res.user;
      },
      async loginWithOtp(phone, otp) {
        const res = await api.verifyOtp(phone, otp);
        setSession(res.token, res.user);
        setUser(res.user);
        void claimOfflineQueue(res.user);
        void enablePushForSession();
        return res.user;
      },
      logout() {
        void disablePushForSession(); // drop this device's token before clearing the session
        clearSession();
        setUser(null);
        // Return to the public home page at the origin root (the shop landing),
        // NOT the portal's /app/login. Sign-in starts at "/" (the login overlay)
        // and logout ends there, so the whole loop begins and ends on the home
        // page. "/" is outside the SPA basename, so this is a full navigation out
        // of the portal — which also guarantees a clean slate for the next user.
        if (typeof window !== 'undefined') window.location.href = '/';
      },
      updateUser(next) {
        const token = getToken();
        if (token) setSession(token, next);
        setUser(next);
      },
    }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
