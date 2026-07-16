import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OfflineQueuedError } from '@marutham/api-client';
import { DeliverSheet } from './DeliverSheet';

/* Proof-of-delivery goes through the offline write queue: a doorstep is exactly
 * where signal dies. What matters here is that the scan carries the stage the agent
 * was looking at (the server refuses a replay if the order moved on), and that being
 * offline is reported as parked rather than failed — without faking the status. */

const toast = vi.fn();
const getCurrentPosition = vi.fn();
const getOrder = vi.fn();
const deliverOffline = vi.fn();
const onChanged = vi.fn();

vi.mock('../../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('../../../native/geolocation', () => ({
  getCurrentPosition: () => getCurrentPosition(),
}));
vi.mock('@marutham/api-client', async (importActual) => {
  const actual = await importActual<typeof import('@marutham/api-client')>();
  return {
    ...actual,
    api: {
      getOrder: (...args: unknown[]) => getOrder(...args),
      deliverOffline: (...args: unknown[]) => deliverOffline(...args),
    },
  };
});

function orderAt(stage: number) {
  return {
    order: {
      id: 'o1',
      code: 'ORD1',
      stage,
      status: 'Out for Delivery',
      pay_method: 'UPI',
      total: 100,
      route: 'direct',
    },
    items: [{ name: 'Tomato', qty: 2, unit: 'kg' }],
  };
}

const queued = () =>
  new OfflineQueuedError({
    id: 'q1',
    method: 'POST',
    path: '/orders/o1/scan',
    createdAt: 0,
    attempts: 0,
  });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentPosition.mockResolvedValue({ lat: 10.5, lng: 78.8 });
  getOrder.mockResolvedValue(orderAt(4));
  deliverOffline.mockResolvedValue({ message: 'Order advanced to: Delivered.' });
});

async function renderAndConfirm(orderId = 'o1') {
  const user = userEvent.setup();
  const view = render(
    <DeliverSheet open orderId={orderId} onClose={vi.fn()} onChanged={onChanged} />,
  );
  await user.click(await screen.findByRole('button', { name: /Confirm Delivered/ }));
  return view;
}

describe('DeliverSheet', () => {
  it('sends the delivery scan with the stage it loaded', async () => {
    await renderAndConfirm();

    await waitFor(() => expect(deliverOffline).toHaveBeenCalled());
    expect(deliverOffline).toHaveBeenCalledWith('o1', 4, { lat: 10.5, lng: 78.8 });
    expect(onChanged).toHaveBeenCalled();
  });

  it('delivers without a fix when the agent declines location', async () => {
    getCurrentPosition.mockResolvedValue(null);

    await renderAndConfirm();

    // a missing fix must never block the delivery — it just travels without coords
    await waitFor(() => expect(deliverOffline).toHaveBeenCalledWith('o1', 4, undefined));
  });

  it('offline — reports the write as parked, not failed', async () => {
    deliverOffline.mockRejectedValue(queued());

    await renderAndConfirm();

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringContaining('sync'), 'ok'));
    // 'ok', not 'er': the delivery is saved, just not sent yet
    expect(onChanged).toHaveBeenCalled();
  });

  it('surfaces a real server error as an error', async () => {
    deliverOffline.mockRejectedValue(new Error('Order is already delivered.'));

    await renderAndConfirm();

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Order is already delivered.', 'er'));
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('re-enables the button for the next order — the sheet is never unmounted', async () => {
    // Regression: `busy` survives a close, so a second delivery found the button
    // stuck on "Confirming…" until a page reload.
    const { rerender } = await renderAndConfirm();
    await waitFor(() => expect(deliverOffline).toHaveBeenCalled());

    getOrder.mockResolvedValue(orderAt(4));
    rerender(<DeliverSheet open orderId="o2" onClose={vi.fn()} onChanged={onChanged} />);

    const button = await screen.findByRole('button', { name: /Confirm Delivered/ });
    await waitFor(() => expect(button).toBeEnabled());
  });
});
