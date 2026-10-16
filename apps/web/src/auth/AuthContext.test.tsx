import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* Opening the app with no signal must NOT sign the user out: only a server that
 * rejects the token (401) ends the session. */

const me = vi.fn();
vi.mock('../native/push', () => ({
  enablePushForSession: vi.fn(),
  disablePushForSession: vi.fn(),
}));
vi.mock('@marutham/api-client', async (orig) => {
  const real = await orig<typeof import('@marutham/api-client')>();
  return {
    ...real,
    api: { ...real.api, me: () => me() },
    flushQueue: vi.fn(),
    clearOfflineQueue: vi.fn(),
  };
});

const { AuthProvider, useAuth } = await import('./AuthContext');
const { ApiError, setSession, getToken } = await import('@marutham/api-client');

function Who() {
  const { user, loading } = useAuth();
  if (loading) return <p>loading</p>;
  return <p>{user ? `user:${user.id}` : 'signed-out'}</p>;
}

beforeEach(() => {
  localStorage.clear();
  me.mockReset();
  setSession('tok', { id: 'u1', role: 'admin' } as never);
});

describe('AuthProvider session restore', () => {
  it('keeps the cached user when /auth/me fails at the network layer', async () => {
    me.mockRejectedValue(new TypeError('Failed to fetch'));
    render(
      <AuthProvider>
        <Who />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('user:u1')).toBeInTheDocument());
    expect(getToken()).toBe('tok');
  });

  it('signs out when the server rejects the token', async () => {
    me.mockRejectedValue(new ApiError('Token invalid or expired.', 401));
    render(
      <AuthProvider>
        <Who />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
    expect(getToken()).toBeNull();
  });
});
