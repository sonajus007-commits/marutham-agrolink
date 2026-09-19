import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ChartContainer,
  ConfirmDialog,
  Modal,
  StatTile,
  Select,
  INPUT_CLASS,
} from '@marutham/ui';
import {
  api,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type ExpenseListResponse,
  type MonthlyPnl,
} from '@marutham/api-client';
import { semantic } from '@marutham/tokens';
import { fmtMoney } from '@marutham/lib';
import { useToast } from '../../components/Toast';

/**
 * Profit & loss + the operating-expense ledger (migration 062), for the Finance home.
 *
 * The `pnl` prop is the month's revenue-vs-expenses cut from GET /dashboard/finance
 * (revenue and EBITDA/net-profit). This panel adds the ledger itself: the month's
 * expense list, an "Add expense" form, and delete — the Finance role's actual tool.
 * On any change it refreshes its own list AND asks the parent to refresh the P&L.
 *
 * MONEY: `pnl` amounts and the list `summary` are RUPEES already; `amount` typed into
 * the form is RUPEES and the API stores paise.
 */
export function ExpensesPanel({
  pnl,
  onChanged,
}: {
  pnl: MonthlyPnl | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [list, setList] = useState<ExpenseListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [toDelete, setToDelete] = useState<Expense | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state.
  const [category, setCategory] = useState<ExpenseCategory>('salary');
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await api.getExpenses());
    } catch {
      toast(t('admin.finance.exp.loadFailed', 'Could not load expenses.'), 'er');
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setCategory('salary');
    setAmount('');
    setVendor('');
    setNote('');
    setAdding(true);
  }

  async function save() {
    const rupees = Number(amount);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      toast(t('admin.finance.exp.badAmount', 'Enter an amount greater than zero.'), 'er');
      return;
    }
    setBusy(true);
    try {
      await api.logExpense({
        category,
        amount: rupees,
        vendor: vendor.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast(t('admin.finance.exp.added', 'Expense recorded.'), 'ok');
      setAdding(false);
      await load();
      onChanged();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : t('admin.finance.exp.addFailed', 'Could not record the expense.'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.deleteExpense(id);
      toast(t('admin.finance.exp.deleted', 'Expense deleted.'), 'ok');
      setToDelete(null);
      await load();
      onChanged();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.finance.exp.deleteFailed', 'Could not delete.'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  const catLabel = (c: string) => t(`admin.finance.exp.cat.${c}`, c);

  return (
    <>
      {/* ── P&L (this month) ─────────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.finance.pnl.title', 'Profit & loss (this month)')}
        loading={!pnl}
        height="auto"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            label={t('admin.finance.pnl.revenue', 'Revenue')}
            value={fmtMoney(pnl?.revenue ?? 0)}
            accent={semantic.light.success}
          />
          <StatTile
            label={t('admin.finance.pnl.expenses', 'Expenses')}
            value={fmtMoney(pnl?.expenses_total ?? 0)}
          />
          <StatTile
            label={t('admin.finance.pnl.ebitda', 'EBITDA')}
            value={fmtMoney(pnl?.ebitda ?? 0)}
            accent={(pnl?.ebitda ?? 0) < 0 ? semantic.light.danger : semantic.light.success}
          />
          <StatTile
            label={t('admin.finance.pnl.netProfit', 'Net profit')}
            value={fmtMoney(pnl?.net_profit ?? 0)}
            accent={(pnl?.net_profit ?? 0) < 0 ? semantic.light.danger : semantic.light.success}
          />
          <StatTile
            label={t('admin.finance.pnl.gst', 'GST collected')}
            value={fmtMoney(pnl?.gst_collected ?? 0)}
          />
        </div>
        <p className="mt-2 text-2xs leading-normal text-fg-muted">
          {t(
            'admin.finance.pnl.note',
            'EBITDA excludes tax/interest/depreciation; net profit is after them. GST shown is collected (output tax), not net liability.',
          )}
        </p>
      </ChartContainer>

      {/* ── Expense ledger ───────────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.finance.exp.title', 'Expenses this month')}
        loading={loading && !list}
        height="auto"
        empty={
          !loading && (list?.expenses.length ?? 0) === 0
            ? t('admin.finance.exp.none', 'No expenses recorded this month.')
            : false
        }
      >
        <div className="mb-3">
          <Button onClick={openAdd}>＋ {t('admin.finance.exp.add', 'Add expense')}</Button>
        </div>
        <ul className="space-y-1">
          {(list?.expenses ?? []).map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-3 rounded-lg border border-border-subtle px-3 py-2 text-sm"
            >
              <span className="rounded-pill bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-fg-muted">
                {catLabel(e.category)}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">
                {e.vendor || e.note || e.incurred_on}
              </span>
              <span className="tabular-nums font-semibold text-fg">{fmtMoney(e.amount)}</span>
              <button
                type="button"
                className="text-fg-muted hover:text-danger"
                aria-label={t('admin.finance.exp.delete', 'Delete expense')}
                onClick={() => setToDelete(e)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </ChartContainer>

      {/* Add-expense form */}
      <Modal
        open={adding}
        title={t('admin.finance.exp.add', 'Add expense')}
        onClose={() => setAdding(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAdding(false)} disabled={busy}>
              {t('admin.finance.exp.cancel', 'Cancel')}
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy ? '…' : t('admin.finance.exp.save', 'Save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="exp-category"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('admin.finance.exp.category', 'Category')}
            </label>
            <Select
              id="exp-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {catLabel(c)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label
              htmlFor="exp-amount"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('admin.finance.exp.amount', 'Amount (₹)')}
            </label>
            <input
              id="exp-amount"
              aria-label={t('admin.finance.exp.amount', 'Amount (₹)')}
              className={INPUT_CLASS}
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <label
              htmlFor="exp-vendor"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('admin.finance.exp.vendor', 'Vendor (optional)')}
            </label>
            <input
              id="exp-vendor"
              aria-label={t('admin.finance.exp.vendor', 'Vendor (optional)')}
              className={INPUT_CLASS}
              value={vendor}
              maxLength={200}
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="exp-note"
              className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            >
              {t('admin.finance.exp.noteLabel', 'Note (optional)')}
            </label>
            <textarea
              id="exp-note"
              aria-label={t('admin.finance.exp.noteLabel', 'Note (optional)')}
              className={INPUT_CLASS}
              rows={2}
              value={note}
              maxLength={1000}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title={t('admin.finance.exp.deleteConfirm', 'Delete this expense?')}
        subtitle={
          toDelete ? `${catLabel(toDelete.category)} · ${fmtMoney(toDelete.amount)}` : undefined
        }
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove(toDelete.id)}
        confirmLabel={t('admin.finance.exp.delete', 'Delete')}
        cancelLabel={t('admin.finance.exp.cancel', 'Cancel')}
        busy={busy}
      >
        {t(
          'admin.finance.exp.deleteBody',
          'This removes the expense from the ledger and the month’s profit figures.',
        )}
      </ConfirmDialog>
    </>
  );
}
