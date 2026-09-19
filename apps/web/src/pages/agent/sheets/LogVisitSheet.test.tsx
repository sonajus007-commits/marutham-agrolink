import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogVisitSheet } from './LogVisitSheet';

/* The farmer-visit logger (migration 061). The tests hold its contract: it loads the
 * caller's farmers into the picker, sends the chosen farmer + purpose + note, refuses
 * to submit with no farmer, and surfaces a server error without closing. */

const toast = vi.fn();
const getFarmers = vi.fn();
const logFarmerVisit = vi.fn();
const onClose = vi.fn();
const onLogged = vi.fn();

vi.mock('../../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('@marutham/api-client', async (orig) => {
  const actual = await orig<typeof import('@marutham/api-client')>();
  return {
    ...actual,
    api: {
      getFarmers: (...a: unknown[]) => getFarmers(...a),
      logFarmerVisit: (...a: unknown[]) => logFarmerVisit(...a),
    },
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  getFarmers.mockResolvedValue({
    farmers: [
      { id: 'f1', fname: 'Murugan', lname: 'S', village_town: 'Alangudi' },
      { id: 'f2', fname: 'Kavitha', lname: 'R', village_town: 'Keeranur' },
    ],
  });
  logFarmerVisit.mockResolvedValue({ visit: { id: 'v1' } });
});

function open() {
  render(<LogVisitSheet open onClose={onClose} onLogged={onLogged} />);
  // delay: null removes userEvent's inter-keystroke wait so the suite stays fast and
  // deterministic under load (this box is thermally throttled).
  return userEvent.setup({ delay: null });
}

describe('LogVisitSheet', () => {
  it('loads the farmers and logs the chosen visit, then closes', async () => {
    const user = open();
    // Farmer options arrive from getFarmers.
    await screen.findByRole('option', { name: /Murugan S/ });

    await user.selectOptions(screen.getByLabelText('Farmer'), 'f2');
    await user.selectOptions(screen.getByLabelText('Purpose'), 'onboarding');
    await user.type(screen.getByLabelText('Notes (optional)'), 'New signup');
    await user.click(screen.getByRole('button', { name: /Log visit/i }));

    await waitFor(
      () =>
        expect(logFarmerVisit).toHaveBeenCalledWith({
          farmer_id: 'f2',
          purpose: 'onboarding',
          notes: 'New signup',
        }),
      { timeout: 3000 },
    );
    expect(onLogged).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
    // 15s ceiling: the multi-select + type + submit flow is well under a second on
    // CI, but this thermally-throttled dev box can drift past vitest's 5s default
    // under full-suite load. The higher ceiling removes the flake without hiding a
    // real hang.
  }, 15000);

  it('will not submit without a farmer chosen', async () => {
    open();
    await screen.findByRole('option', { name: /Murugan S/ });
    // Button is disabled until a farmer is picked.
    expect(screen.getByRole('button', { name: /Log visit/i })).toBeDisabled();
    expect(logFarmerVisit).not.toHaveBeenCalled();
  });

  it('surfaces a server error and stays open', async () => {
    logFarmerVisit.mockRejectedValue(new Error('Could not log the visit.'));
    const user = open();
    await screen.findByRole('option', { name: /Murugan S/ });
    await user.selectOptions(screen.getByLabelText('Farmer'), 'f1');
    await user.click(screen.getByRole('button', { name: /Log visit/i }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Could not log the visit.', 'er'));
    expect(onClose).not.toHaveBeenCalled();
  });
});
