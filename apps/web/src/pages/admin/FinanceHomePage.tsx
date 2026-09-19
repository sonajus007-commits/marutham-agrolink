import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, ChartContainer, StatTile } from '@marutham/ui';
import { api, type FinanceDashboardResponse } from '@marutham/api-client';
import { semantic, colors } from '@marutham/tokens';
import { fmtMoney, fmtNum } from '@marutham/lib';

/**
 * The Finance role home (GET /dashboard/finance, Phase 4).
 *
 * The Finance specialist owns payments + settlements company-wide but has no board
 * dashboard, so they used to land on the bare Payouts list. This is their real home:
 * the platform's money movement at a glance — revenue in, settlements out, cash still
 * to collect — the SAME figures the Executive dashboard shows (shared server-side).
 *
 * MONEY: every amount arrives in RUPEES already (rup()'d server-side) — fmtMoney it,
 * never divide by 100.
 *
 * NOT a P&L: net profit / EBITDA / cash flow / GST-TDS liability need a real expense
 * ledger + a chart of accounts the platform does not keep, so they are deliberately
 * absent rather than fabricated. The footnote says so.
 */
export function FinanceHomePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<FinanceDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getFinanceDashboard());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('admin.finance.error', 'Could not load finance.'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const f = data?.financial;
  const stale = data?.payouts_aging.stale_count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">
            💰 {t('admin.finance.title', 'Finance')}
          </h1>
          <p className="text-2xs text-fg-muted">
            {t('admin.finance.subtitle', 'Company-wide money movement')}
          </p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.finance.refresh', 'Refresh')}
        </Button>
      </div>

      {error ? (
        <p className="rounded-base bg-surface-muted px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {/* ── Revenue in ─────────────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.finance.revenue.title', 'Revenue')}
        loading={loading && !data}
        height="auto"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            label={t('admin.finance.revenue.gmvMonth', 'GMV this month')}
            value={fmtMoney(data?.gmv.month ?? 0)}
            accent={colors.forest}
          />
          <StatTile
            label={t('admin.finance.revenue.gmvToday', 'GMV today')}
            value={fmtMoney(data?.gmv.today ?? 0)}
          />
          <StatTile
            label={t('admin.finance.revenue.commission', 'Platform commission')}
            value={fmtMoney(f?.platform_commission ?? 0)}
            accent={semantic.light.success}
          />
          <StatTile
            label={t('admin.finance.revenue.delivery', 'Delivery income')}
            value={fmtMoney(f?.delivery_income ?? 0)}
          />
          <StatTile
            label={t('admin.finance.revenue.subscription', 'Subscription income')}
            value={fmtMoney(f?.subscription_income ?? 0)}
          />
        </div>
      </ChartContainer>

      {/* ── Settlements & cash ─────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.finance.settle.title', 'Settlements & cash')}
        loading={loading && !data}
        height="auto"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatTile
            label={t('admin.finance.settle.today', 'Settled today')}
            value={fmtMoney(f?.settlement_today ?? 0)}
            accent={semantic.light.success}
          />
          <StatTile
            label={t('admin.finance.settle.pendingAmount', 'Payouts pending')}
            value={fmtMoney(f?.payouts_pending ?? 0)}
            accent={(f?.payouts_pending ?? 0) > 0 ? semantic.light.warning : undefined}
          />
          <StatTile
            label={t('admin.finance.settle.paid', 'Payouts paid (all-time)')}
            value={fmtMoney(f?.payouts_paid ?? 0)}
          />
          <StatTile
            label={t('admin.finance.settle.receivables', 'Receivables')}
            value={fmtMoney(f?.receivables ?? 0)}
            accent={(f?.receivables ?? 0) > 0 ? semantic.light.warning : undefined}
          />
          <StatTile
            label={t('admin.finance.settle.pendingCount', 'Payouts queued')}
            value={fmtNum(data?.payouts_aging.pending_count ?? 0)}
          />
          <StatTile
            label={t('admin.finance.settle.stale', 'Overdue (>7 days)')}
            value={fmtNum(stale)}
            accent={stale > 0 ? semantic.light.danger : undefined}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/admin/payouts" className="ma-chip">
            {t('admin.finance.gotoPayouts', 'Run settlements →')}
          </Link>
          <Link to="/admin/reports" className="ma-chip">
            {t('admin.finance.gotoReports', 'Financial reports →')}
          </Link>
        </div>
      </ChartContainer>

      <p className="text-2xs leading-normal text-fg-muted">
        {t(
          'admin.finance.ledgerNote',
          'These figures are actual platform money movement. A full P&L (net profit, EBITDA, cash flow, GST/TDS liability) needs a dedicated accounting ledger and is not shown here.',
        )}
      </p>
    </div>
  );
}
