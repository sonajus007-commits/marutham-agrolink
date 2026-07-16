import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineQueuedError } from '@marutham/api-client';
import { FarmLocationCard } from './FarmLocationCard';

/* The card saves the farm pin through the offline write queue. Two branches that
 * matter: online (a real save + server user), and offline (the write is parked, so
 * the card must still show the pin optimistically and say it will sync). */

const updateUser = vi.fn();
const toast = vi.fn();
const getCurrentPosition = vi.fn();
const apiFetchOffline = vi.fn();

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', role: 'farmer' }, updateUser }),
}));
vi.mock('../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('../../native/geolocation', () => ({
  getCurrentPosition: () => getCurrentPosition(),
}));
vi.mock('@marutham/api-client', async (importActual) => {
  const actual = await importActual<typeof import('@marutham/api-client')>();
  return { ...actual, apiFetchOffline: (...args: unknown[]) => apiFetchOffline(...args) };
});

beforeEach(() => {
  vi.clearAllMocks();
});

const clickSave = async () => {
  const user = userEvent.setup();
  render(<FarmLocationCard />);
  await user.click(screen.getByRole('button'));
};

describe('FarmLocationCard', () => {
  it('online — saves the fix and commits the server user', async () => {
    getCurrentPosition.mockResolvedValue({ lat: 10.5, lng: 78.5 });
    apiFetchOffline.mockResolvedValue({ user: { id: 'u1', farm_lat: 10.5, farm_lng: 78.5 } });

    await clickSave();

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    // the save went through the offline-aware path, keyed + replace so a re-pin wins
    expect(apiFetchOffline).toHaveBeenCalledWith(
      'PATCH',
      '/auth/me',
      { farm_lat: 10.5, farm_lng: 78.5 },
      { key: 'farm-u1', replace: true },
    );
    expect(updateUser).toHaveBeenCalledWith({ id: 'u1', farm_lat: 10.5, farm_lng: 78.5 });
    expect(toast).toHaveBeenCalledWith('Farm location saved.', 'ok');
  });

  it('offline — parks the write but shows the pin optimistically and says it will sync', async () => {
    getCurrentPosition.mockResolvedValue({ lat: 11.1, lng: 79.9 });
    apiFetchOffline.mockRejectedValue(
      new OfflineQueuedError({
        id: 'q1',
        method: 'PATCH',
        path: '/auth/me',
        createdAt: 0,
        attempts: 0,
      }),
    );

    await clickSave();

    await waitFor(() => expect(updateUser).toHaveBeenCalled());
    // optimistic: the current user is updated locally with the new coords
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', farm_lat: 11.1, farm_lng: 79.9 }),
    );
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('sync'), 'ok');
  });

  it('no fix — saves nothing and tells the farmer why', async () => {
    getCurrentPosition.mockResolvedValue(null);

    await clickSave();

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.stringContaining('Could not get your location'),
        'er',
      ),
    );
    expect(apiFetchOffline).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
