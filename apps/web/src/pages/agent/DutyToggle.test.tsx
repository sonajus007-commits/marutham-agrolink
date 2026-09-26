import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DutyToggle } from './DutyToggle';

/* The daily duty prompt. It pops only when there is NO attendance row today (a
 * check-out still counts), "Not today" silences it for the day, and "Check in" goes
 * on duty exactly as the pill does. */

const toast = vi.fn();
const getMyAttendance = vi.fn();
const checkIn = vi.fn();
const checkOut = vi.fn();

vi.mock('../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('../../native/geolocation', () => ({ getCurrentPosition: async () => null }));
vi.mock('@marutham/api-client', async (orig) => {
  const actual = await orig<typeof import('@marutham/api-client')>();
  return {
    ...actual,
    api: {
      getMyAttendance: (...a: unknown[]) => getMyAttendance(...a),
      checkIn: (...a: unknown[]) => checkIn(...a),
      checkOut: (...a: unknown[]) => checkOut(...a),
    },
  };
});

const PROMPT = /are you on duty today/i;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  checkIn.mockResolvedValue({ status: 'on_duty', attendance: {} });
});

describe('DutyToggle daily prompt', () => {
  it('prompts when the staffer has not checked in today, and checks them in', async () => {
    getMyAttendance.mockResolvedValue({ status: 'off_duty', attendance: null });
    render(<DutyToggle />);

    expect(await screen.findByText(PROMPT)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check in' }));

    await waitFor(() => expect(checkIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(PROMPT)).not.toBeInTheDocument());
    expect(screen.getByRole('button', { pressed: true })).toBeInTheDocument();
  });

  it('does not prompt someone who already checked in (or out) today', async () => {
    getMyAttendance.mockResolvedValue({ status: 'off_duty', attendance: { checked_out_at: 'x' } });
    render(<DutyToggle />);

    await waitFor(() => expect(getMyAttendance).toHaveBeenCalled());
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it('"Not today" dismisses it and it stays dismissed for the day', async () => {
    getMyAttendance.mockResolvedValue({ status: 'off_duty', attendance: null });
    const { unmount } = render(<DutyToggle />);

    await userEvent.click(await screen.findByRole('button', { name: 'Not today' }));
    await waitFor(() => expect(screen.queryByText(PROMPT)).not.toBeInTheDocument());
    expect(checkIn).not.toHaveBeenCalled();

    unmount();
    render(<DutyToggle />);
    await waitFor(() => expect(getMyAttendance).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it('never prompts when the status read fails', async () => {
    getMyAttendance.mockRejectedValue(new Error('offline'));
    render(<DutyToggle />);

    await waitFor(() => expect(getMyAttendance).toHaveBeenCalled());
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });
});
