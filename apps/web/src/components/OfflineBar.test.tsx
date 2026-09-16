import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineBar } from './OfflineBar';

/* The field portals' connectivity truth. Two live sources drive it — the network
 * signal and the offline queue's pending count — so the tests hold each state the
 * plan's Section L asks for: silent when healthy, an offline notice with a count,
 * and a syncing notice once the connection is back but the queue hasn't drained. */

let networkCb: ((online: boolean) => void) | undefined;
let offlineCb: ((count: number) => void) | undefined;
const unsubNetwork = vi.fn();
const unsubOffline = vi.fn();

vi.mock('../native', () => ({
  onNetworkChange: (cb: (online: boolean) => void) => {
    networkCb = cb;
    return Promise.resolve(unsubNetwork);
  },
}));
vi.mock('@marutham/api-client', () => ({
  subscribeOffline: (cb: (count: number) => void) => {
    offlineCb = cb;
    return unsubOffline;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  networkCb = undefined;
  offlineCb = undefined;
});

async function seed(online: boolean, pending: number) {
  render(<OfflineBar />);
  // onNetworkChange resolves a microtask later; let the promise settle first.
  await act(async () => {});
  act(() => {
    networkCb?.(online);
    offlineCb?.(pending);
  });
}

describe('OfflineBar', () => {
  it('renders nothing when online with a drained queue', async () => {
    await seed(true, 0);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the offline notice with the pending count', async () => {
    await seed(false, 3);
    const bar = screen.getByRole('status');
    expect(bar.className).toContain('is-offline');
    expect(bar.textContent).toMatch(/offline/i);
    expect(bar.textContent).toMatch(/3/);
  });

  it('shows a plain offline notice when nothing is queued', async () => {
    await seed(false, 0);
    const bar = screen.getByRole('status');
    expect(bar.className).toContain('is-offline');
    expect(bar.textContent).toMatch(/offline/i);
  });

  it('shows the syncing notice when back online with a non-empty queue', async () => {
    await seed(true, 2);
    const bar = screen.getByRole('status');
    expect(bar.className).toContain('is-syncing');
    expect(bar.textContent).toMatch(/2/);
  });
});
