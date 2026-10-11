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
const scannerAvailable = vi.fn();
const scanQrCode = vi.fn();

vi.mock('../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('../../native/scanner', () => ({
  scannerAvailable: () => scannerAvailable(),
  scanQrCode: () => scanQrCode(),
}));
vi.mock('@marutham/api-client', () => ({
  api: { scanOrder: (...args: unknown[]) => scanOrder(...args) },
}));

beforeEach(() => {
  vi.clearAllMocks();
  scanOrder.mockResolvedValue({ newStatus: 'Picked Up' });
  scannerAvailable.mockReturnValue(false); // browser unless a test says otherwise
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

  it('offers no camera button in the browser', () => {
    open();
    expect(screen.queryByRole('button', { name: /camera/i })).toBeNull();
  });

  it('in the phone app, a camera scan advances the scanned order', async () => {
    scannerAvailable.mockReturnValue(true);
    scanQrCode.mockResolvedValue({ kind: 'code', code: 'ORDPDK261011000001' });
    const user = open();
    await user.click(screen.getByRole('button', { name: /camera/i }));

    await waitFor(() => expect(scanOrder).toHaveBeenCalledWith('ORDPDK261011000001'));
    expect(onScanned).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('a cancelled camera scan stays open and calls nothing', async () => {
    scannerAvailable.mockReturnValue(true);
    scanQrCode.mockResolvedValue({ kind: 'cancelled' });
    const user = open();
    await user.click(screen.getByRole('button', { name: /camera/i }));

    await waitFor(() => expect(scanQrCode).toHaveBeenCalled());
    expect(scanOrder).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /camera/i })).toBeEnabled();
  });

  it('a camera that will not open points to typing the code', async () => {
    scannerAvailable.mockReturnValue(true);
    scanQrCode.mockResolvedValue({ kind: 'failed' });
    const user = open();
    await user.click(screen.getByRole('button', { name: /camera/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/type/i), 'er'));
    expect(scanOrder).not.toHaveBeenCalled();
  });

  it('a photo with no readable QR asks to try again closer', async () => {
    scannerAvailable.mockReturnValue(true);
    scanQrCode.mockResolvedValue({ kind: 'unreadable' });
    const user = open();
    await user.click(screen.getByRole('button', { name: /camera/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/closer/i), 'er'));
    expect(scanOrder).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /camera/i })).toBeEnabled();
  });
});
