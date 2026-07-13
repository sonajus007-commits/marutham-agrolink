import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, ChartContainer, StatTile } from '@marutham/ui';
import { api, type OperationsDashboardResponse } from '@marutham/api-client';
import { semantic, colors } from '@marutham/tokens';
import {
  deliveryStages, totalInPipeline, rankedOpsDistricts, sortAlerts, alertTone,
  fmtMoney, fmtNum,
} from '@marutham/lib';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';
import { PlaceholderSection } from '../../components/PlaceholderSection';
import { ToneDot } from '../../components/ToneDot';

/**
 * The operations dashboard — District Manager & Hub Incharge (their district),
 * Regional/State/Zonal Manager (their state), Head Office (everything).
 *
 * Ported from legacy frontend/js/dashboard/operations.js, which was dispatched as
 * these roles' Overview. When the console moved to React they all landed on the
 * GENERIC Overview instead, which knows nothing about collections, returns,
 * payouts or agents — the four things this audience actually manages.
 *
 * SCOPE IS THE SERVER'S. It reads the signed-in user and reports what it chose in
 * `scope`; we display that, we never compute it. A client that decided its own
 * scope would be a client that could widen it.
 *
 * MONEY: every figure here is ALREADY IN RUPEES (the route converts paise itself
 * and keeps the field names out of the money middleware's MONEY_FIELDS set). Do
 * NOT divide by 100 — the opposite of the generic Overview, whose
 * `daily_trend[].revenue` IS paise.
 */
export function OperationsPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<OperationsDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getOperationsDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.ops.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(() => deliveryStages(data?.delivery_status.status_breakdown), [data]);
  const districts = useMemo(() => rankedOpsDistricts(data?.districts), [data]);
  const alerts = useMemo(() => sortAlerts(data?.alerts), [data]);

  /* Delivery status — a BAR along the pipeline, not a pie. These are stages of
   * one flow, so their order carries meaning and their comparison is the task;
   * a pie would throw the order away and ask you to compare angles. One series,
   * one hue: the x-position already says which stage. */
  const stageOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 8, right: 8, top: 16, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: stages.map((s) => s.status),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: {
          color: colors.gray,
          interval: 0,
          rotate: stages.length > 4 ? 30 : 0,
        },
      },
      yAxis: {
        type: 'value',
        minInterval: 1, // orders are whole things; a "2.5 orders" gridline is a lie
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { color: colors.gray },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 40,
          itemStyle: { color: colors.leaf, borderRadius: [4, 4, 0, 0] },
          label: { show: true, position: 'top', color: colors.gray, fontSize: 11 },
          data: stages.map((s) => s.count),
        },
      ],
    }),
    [stages],
  );

  /* District breakdown — orders vs still-pending, side by side. Two series, so
   * this one gets a legend. Only shown when there is more than one district to
   * compare; at district scope it would be a bar chart of a single bar. */
  const districtOption = useMemo<EChartsOption>(
    () => ({
      grid: { left: 8, right: 16, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, icon: 'circle', textStyle: { color: colors.gray } },
      xAxis: {
        type: 'category',
        data: districts.map((d) => d.district),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { color: colors.gray, interval: 0, rotate: districts.length > 5 ? 40 : 0 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { color: colors.gray },
      },
      series: [
        {
          name: t('admin.ops.districts.orders'),
          type: 'bar',
          barMaxWidth: 28,
          itemStyle: { color: colors.leaf, borderRadius: [4, 4, 0, 0] },
          data: districts.map((d) => d.orders),
        },
        {
          // Pending is a WARNING, not another category — it wears the status role.
          name: t('admin.ops.districts.pending'),
          type: 'bar',
          barMaxWidth: 28,
          itemStyle: { color: semantic.light.warning, borderRadius: [4, 4, 0, 0] },
          data: districts.map((d) => d.pending),
        },
      ],
    }),
    [districts, t],
  );

  const s = data?.summary;
  const scope = data?.scope;
  const updated = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">
            {t('admin.ops.title')}
            {scope?.name ? ` — ${scope.name}` : ''}
          </h1>
          <p className="text-xs text-fg-muted">
            {/* Say WHOSE numbers these are. A District Manager and Head Office see
                the same screen with very different totals, and the only thing that
                distinguishes them is this line. */}
            {scope ? t(`admin.ops.scope.${scope.level}`) : t('admin.ops.subtitle')}
            {updated ? ` · ${t('admin.ops.updated', { time: updated })}` : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={loading}>
          {t('admin.ops.refresh')}
        </Button>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg">
          {/403|restricted/i.test(error) ? t('admin.ops.denied') : error}
        </div>
      ) : null}

      {/* ── Today ────────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon="🆕" label={t('admin.ops.kpi.ordersToday')} value={fmtNum(s?.orders_today ?? 0)} />
        <StatTile icon="💰" label={t('admin.ops.kpi.revenueToday')} value={fmtMoney(s?.revenue_today ?? 0)} />
        <StatTile icon="📅" label={t('admin.ops.kpi.revenueWeek')} value={fmtMoney(s?.revenue_week ?? 0)} />
        <StatTile icon="📦" label={t('admin.ops.kpi.activeOrders')} value={fmtNum(s?.active_orders ?? 0)} />
        <StatTile
          icon="✅"
          label={t('admin.ops.kpi.deliveredToday')}
          value={fmtNum(s?.delivered_today ?? 0)}
          accent={semantic.light.success}
        />
        <StatTile
          icon="⏳"
          label={t('admin.ops.kpi.pendingDeliveries')}
          value={fmtNum(s?.pending_deliveries ?? 0)}
          accent={semantic.light.warning}
        />
      </section>

      {/* ── Quick actions ────────────────────────────────────────────────────
          The point of this screen: every alert below has a door here. These are
          real router links, not buttons that fake a click on a legacy tab. */}
      <ChartContainer title={t('admin.ops.actions.title')} loading={loading && !data} height="auto">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionLink
            to="/admin/registrations"
            icon="🧑‍🌾"
            label={t('admin.ops.actions.approveFarmers')}
            count={data?.farmers.pending_approval}
          />
          <ActionLink
            to="/admin/orders"
            icon="🛵"
            label={t('admin.ops.actions.assignDelivery')}
            count={data?.summary.pending_deliveries}
          />
          <ActionLink
            to="/admin/returns"
            icon="↩️"
            label={t('admin.ops.actions.handleReturns')}
            count={data?.quality.pending_returns}
          />
          <ActionLink
            to="/admin/payouts"
            icon="💸"
            label={t('admin.ops.actions.farmerPayouts')}
            count={data?.payments.pending_count}
          />
        </div>
      </ChartContainer>

      {/* ── Delivery status + Collections ────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer
          title={t('admin.ops.delivery.title')}
          subtitle={t('admin.ops.delivery.inPipeline', { count: totalInPipeline(stages) })}
          loading={loading && !data}
          empty={!loading && stages.length === 0 ? t('admin.ops.delivery.none') : false}
          height="auto"
          footer={
            <p className="text-xs text-fg-muted">
              {t('admin.ops.delivery.agents', { count: data?.delivery_status.agents_total ?? 0 })}
            </p>
          }
        >
          <EChart option={stageOption} height={260} />
        </ChartContainer>

        <ChartContainer title={t('admin.ops.collections.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={t('admin.ops.collections.confirmed')} value={fmtNum(data?.collections.confirmed_listings ?? 0)} />
            <StatTile label={t('admin.ops.collections.listed')} value={fmtNum(data?.collections.listed_active ?? 0)} />
            <StatTile label={t('admin.ops.collections.updatedToday')} value={fmtNum(data?.collections.updated_today ?? 0)} />
          </div>
        </ChartContainer>
      </div>

      {/* ── Returns + Payments ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer title={t('admin.ops.quality.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-3 gap-3">
            <StatTile
              label={t('admin.ops.quality.pending')}
              value={fmtNum(data?.quality.pending_returns ?? 0)}
              accent={semantic.light.warning}
            />
            <StatTile label={t('admin.ops.quality.toCollect')} value={fmtNum(data?.quality.to_collect ?? 0)} />
            <StatTile label={t('admin.ops.quality.rejected')} value={fmtNum(data?.quality.rejected_returns ?? 0)} />
          </div>
        </ChartContainer>

        <ChartContainer title={t('admin.ops.payments.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={t('admin.ops.payments.pending')} value={fmtNum(data?.payments.pending_count ?? 0)} />
            <StatTile label={t('admin.ops.payments.amount')} value={fmtMoney(data?.payments.pending_amount ?? 0)} />
            <StatTile
              label={t('admin.ops.payments.overdue')}
              value={fmtNum(data?.payments.stale_count ?? 0)}
              // Overdue is the one number on this card that means someone is waiting.
              accent={(data?.payments.stale_count ?? 0) > 0 ? semantic.light.danger : undefined}
            />
          </div>
        </ChartContainer>
      </div>

      {/* ── Farmers + Agents ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer title={t('admin.ops.farmers.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-3 gap-3">
            <StatTile label={t('admin.ops.farmers.registered')} value={fmtNum(data?.farmers.registered ?? 0)} />
            <StatTile label={t('admin.ops.farmers.active')} value={fmtNum(data?.farmers.active ?? 0)} accent={semantic.light.success} />
            <StatTile
              label={t('admin.ops.farmers.pendingApproval')}
              value={fmtNum(data?.farmers.pending_approval ?? 0)}
              accent={(data?.farmers.pending_approval ?? 0) > 0 ? semantic.light.warning : undefined}
            />
          </div>
        </ChartContainer>

        <ChartContainer
          title={t('admin.ops.agents.title')}
          subtitle={t('admin.ops.agents.active', { count: data?.delivery_status.agents_total ?? 0 })}
          loading={loading && !data}
          empty={!loading && (data?.agents.length ?? 0) === 0 ? t('admin.ops.agents.none') : false}
          height="auto"
        >
          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {(data?.agents ?? []).map((a, i) => (
              <li
                key={`${a.name}-${a.phone ?? i}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm"
              >
                <span aria-hidden="true">🛵</span>
                <span className="flex-1 truncate text-fg">
                  {a.name || t('admin.ops.agents.unnamed')}
                  {a.vehicle ? <span className="text-fg-muted"> · {a.vehicle}</span> : null}
                </span>
                {a.phone ? (
                  <a href={`tel:${a.phone}`} className="tabular-nums text-fg-muted hover:text-primary">
                    {a.phone}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </ChartContainer>
      </div>

      {/* ── District breakdown ───────────────────────────────────────────────
          Only meaningful above district scope. A District Manager already knows
          which district they are in; charting their single district against
          itself would be a bar chart with one bar. */}
      {districts.length > 1 ? (
        <ChartContainer
          title={t('admin.ops.districts.title')}
          subtitle={t('admin.ops.districts.sub')}
          loading={loading && !data}
          height="auto"
        >
          <EChart option={districtOption} height={280} />

          {/* The chart's TABLE VIEW — carries the same numbers in text, plus the
              revenue the chart has no axis for. */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-subtle text-left">
                  <th className="py-2 pr-4 font-bold text-fg">{t('admin.ops.districts.district')}</th>
                  <th className="py-2 pr-4 text-right font-bold text-fg">{t('admin.ops.districts.orders')}</th>
                  <th className="py-2 pr-4 text-right font-bold text-fg">{t('admin.ops.districts.pending')}</th>
                  <th className="py-2 text-right font-bold text-fg">{t('admin.ops.districts.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {districts.map((d) => (
                  <tr key={d.district} className="border-b border-subtle">
                    <td className="py-2 pr-4 text-fg">{d.district}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-muted">{fmtNum(d.orders)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-fg-muted">{fmtNum(d.pending)}</td>
                    <td className="py-2 text-right tabular-nums text-fg-muted">{fmtMoney(d.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartContainer>
      ) : null}

      {/* ── Action items ─────────────────────────────────────────────────── */}
      <ChartContainer title={t('admin.ops.alerts.title')} loading={loading && !data} height="auto">
        {alerts.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('admin.ops.alerts.none')}</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li key={`${a.type}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-sm">
                {/* Severity carries an icon + the message, never colour alone. */}
                <ToneDot tone={alertTone(a.severity)} />
                <span className="text-fg">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </ChartContainer>

      <PlaceholderSection
        placeholders={data?.placeholders}
        title={t('admin.ops.ph.title')}
        subtitle={t('admin.ops.ph.sub')}
        loading={loading && !data}
      />
    </div>
  );
}

/* A quick action is a LINK, not a button: it goes somewhere, so middle-click and
 * "open in new tab" must work. The count is the backlog waiting behind it — and
 * it is only a badge when there is something to do, because a grey "0" beside
 * "Approve Farmers" is noise pretending to be information. */
function ActionLink({
  to,
  icon,
  label,
  count,
}: {
  to: string;
  icon: string;
  label: string;
  count?: number;
}) {
  const n = count ?? 0;
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-xl border border-subtle bg-surface p-3 text-sm font-bold text-fg no-underline hover:border-primary hover:text-primary"
    >
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{label}</span>
      {n > 0 ? (
        <span className="rounded-full bg-primary px-2 py-0.5 text-xs tabular-nums text-primary-on">
          {fmtNum(n)}
        </span>
      ) : null}
    </Link>
  );
}
