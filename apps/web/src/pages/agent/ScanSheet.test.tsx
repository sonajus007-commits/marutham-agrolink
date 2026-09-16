import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScanSheet } from './ScanSheet';

/* The scan-first entry: one code advances one order via POST /orders/:id/scan. The
 * tests hold the contract — a real code is sent and closes the sheet, an empty one is
 * refused without a request, and a server error is surfaced without closing. */

const toast = vi.fn();
const scanOrder = vi.fn();
const onScanned = vi.fn();
const onClose = vi.fn();

vi.mock('../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('@marutham/api-client', () => ({
  api: { scanOrder: (...args: unknown[]) => scanOrder(...args) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  scanOrder.mockResolvedValue({ newStatus: 'Picked Up' });
});

function open() {
  render(<ScanSheet open onClose={onClose} onScanned={onScanned} />);
  return userEvent.setup();
}

describe('ScanSheet', () => {
  it('scans the entered code, then reloads and closes', async () => {
    const user = open();
    await user.type(await screen.findByLabelText(/Order Code/i), 'ORD1');
    await user.click(screen.getByRole('button', { name: /Go/ }));

    await waitFor(() => expect(scanOrder).toHaveBeenCalledWith('ORD1'));
    expect(onScanned).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses an empty code without calling the API', async () => {
    const user = open();
    await user.click(screen.getByRole('button', { name: /Go/ }));

    expect(scanOrder).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'er');
  });

  it('surfaces a server error and stays open', async () => {
    scanOrder.mockRejectedValue(new Error('Order not found.'));
    const user = open();
    await user.type(await screen.findByLabelText(/Order Code/i), 'BAD');
    await user.click(screen.getByRole('button', { name: /Go/ }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Order not found.', 'er'));
    expect(onClose).not.toHaveBeenCalled();
    expect(onScanned).not.toHaveBeenCalled();
  });
});
