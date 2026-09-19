import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpensesPanel } from './ExpensesPanel';
import type { MonthlyPnl } from '@marutham/api-client';

/* The expense ledger panel (migration 062). The tests hold its contract: it lists the
 * month's expenses, records a new one in rupees, refuses a non-positive amount without
 * hitting the API, and refreshes the parent P&L after a change. */

const toast = vi.fn();
const getExpenses = vi.fn();
const logExpense = vi.fn();
const deleteExpense = vi.fn();
const onChanged = vi.fn();

vi.mock('../../components/Toast', () => ({ useToast: () => toast }));
vi.mock('@marutham/api-client', async (orig) => {
  const actual = await orig<typeof import('@marutham/api-client')>();
  return {
    ...actual,
    api: {
      getExpenses: (...a: unknown[]) => getExpenses(...a),
      logExpense: (...a: unknown[]) => logExpense(...a),
      deleteExpense: (...a: unknown[]) => deleteExpense(...a),
    },
  };
});

const PNL: MonthlyPnl = {
  period: 'month',
  revenue: 100000,
  commission: 5000,
  delivery_income: 2000,
  subscription: 93000,
  gst_collected: 300,
  expenses_total: 40000,
  operating_expenses: 40000,
  ebitda: 60000,
  net_profit: 60000,
  by_category: { salary: 40000 },
};

beforeEach(() => {
  vi.clearAllMocks();
  getExpenses.mockResolvedValue({
    month: '2026-09',
    expenses: [
      {
        id: 'e1',
        category: 'salary',
        amount: '40000',
        incurred_on: '2026-09-01',
        vendor: null,
        note: 'Payroll',
        created_by_name: 'Bhavani',
        created_at: 't',
      },
    ],
    summary: { spent: 40000, operating: 40000, below_line: 0, by_category: { salary: 40000 } },
  });
  logExpense.mockResolvedValue({ expense: { id: 'e2' } });
  deleteExpense.mockResolvedValue({ ok: true });
});

function open() {
  render(<ExpensesPanel pnl={PNL} onChanged={onChanged} />);
  return userEvent.setup({ delay: null });
}

describe('ExpensesPanel', () => {
  it("shows the P&L tiles and the month's expenses", async () => {
    open();
    // EBITDA tile from the pnl prop.
    expect(screen.getByText('EBITDA')).toBeInTheDocument();
    // The loaded expense row.
    await screen.findByText('Payroll');
  });

  it('records a new expense in rupees, then refreshes', async () => {
    const user = open();
    await screen.findByText('Payroll');

    await user.click(screen.getByRole('button', { name: /Add expense/i }));
    await user.selectOptions(screen.getByLabelText('Category'), 'fuel');
    await user.type(screen.getByLabelText('Amount (₹)'), '1500');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    await waitFor(
      () =>
        expect(logExpense).toHaveBeenCalledWith(
          expect.objectContaining({ category: 'fuel', amount: 1500 }),
        ),
      { timeout: 3000 },
    );
    expect(onChanged).toHaveBeenCalled();
  }, 15000);

  it('refuses a non-positive amount without calling the API', async () => {
    const user = open();
    await screen.findByText('Payroll');

    await user.click(screen.getByRole('button', { name: /Add expense/i }));
    // amount left blank
    await user.click(screen.getByRole('button', { name: /^Save$/ }));

    expect(logExpense).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.any(String), 'er');
  }, 15000);
});
