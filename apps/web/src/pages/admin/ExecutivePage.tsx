import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChartContainer, StatTile } from '@marutham/ui';
import { api, type ExecutiveDashboardResponse, type ExecutiveTrendMode } from '@marutham/api-client';
import { semantic, colors } from '@marutham/tokens';
import {
  TREND_MODES, rankedDistricts, findDistrict, districtTone, alertTone,
  formatGrowth, growthDirection, fmtMoney,
  type DistrictPerf,
} from '@marutham/lib';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';
import { TnDistrictMap, type MapState } from '../../components/TnDistrictMap';
import { PlaceholderSection } from '../../components/PlaceholderSection';

/**
 * The executive dashboard — Board of Director / CEO / Managing Director / CFO /
 * CTO, with Head Office allowed to preview (backend EXECUTIVE_ROLES).
 *
 * This existed only in legacy admin.html. When the console moved to React,
 * `roleHome()` started landing every admin — the Board included — on the generic
 * Overview, so the one audience this dashboard was built for lost access to it.
 * This screen is that regression's fix.
 *
 * MONEY: every figure from GET /dashboard/executive is ALREADY IN RUPEES (the
 * route converts paise itself and keeps the field names out of the money
 * middleware's MONEY_FIELDS set). Do NOT divide by 100 here — that is the exact
 * opposite of the Overview page, whose `daily_trend[].revenue` IS paise.
 */
export function ExecutivePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<ExecutiveDashboardResponse | null>(null);
  const [trend, setTrend] = useState<ExecutiveTrendMode>('monthly');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapState, setMapState] = useState<MapState>('loading');
  const [drill, setDrill] = useState<DistrictPerf | null>(null);

  const load = useCallback(async (mode: ExecutiveTrendMode) => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getExecutiveDashboard(mode));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.exec.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load(trend);
  }, [load, trend]);

  const districts = useMemo(() => rankedDistricts(data?.districts ?? []), [data]);

  const onSelectDistrict = useCallback(
    (name: string) => setDrill(findDistrict(data?.districts ?? [], name)),
    [data],
  );

  /* Revenue over time — one series, so no legend (the title names it) and a
   * single hue. Grid and axes are recessive hairlines. */
  const trendOption = useMemo<EChartsOption>(() => {
    const points = data?.trend.points ?? [];
    return {
      grid: { left: 56, right: 16, top: 16, bottom: points.length > 8 ? 56 : 32 },
      tooltip: {
        trigger: 'axis',
        valueFormatter: (v) => fmtMoney(Number(v)),
      },
      xAxis: {
        type: 'category',
        data: points.map((p) => p.label),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { rotate: points.length > 8 ? 30 : 0, color: colors.gray },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { color: colors.gray },
      },
      series: [
        {
          type: 'line',
          smooth: true,
          showSymbol: points.length <= 12,
          symbolSize: 8,
          lineStyle: { width: 2, color: colors.leaf },
          itemStyle: { color: colors.leaf },
          areaStyle: { color: colors.greenbg },
          data: points.map((p) => p.revenue),
        },
      ],
    };
  }, [data]);

  /* Orders by status. This is STATE, not identity, so it wears the status roles
   * — never the categorical series palette. Gold is 2.16:1 on the surface, which
   * the palette validator flags as needing relief: the legend labels every slice
   * and the tiles beside it repeat every number, so no value is colour-only. */
  const ordersOption = useMemo<EChartsOption>(() => {
    const o = data?.orders;
    const slices = [
      { name: t('admin.exec.orders.delivered'), value: o?.delivered ?? 0, color: semantic.light.success },
      { name: t('admin.exec.orders.pending'), value: o?.pending ?? 0, color: semantic.light.warning },
      { name: t('admin.exec.orders.cancelled'), value: o?.cancelled ?? 0, color: semantic.light.danger },
      { name: t('admin.exec.orders.refunded'), value: o?.refunded ?? 0, color: semantic.light.accent },
    ].filter((s) => s.value > 0);

    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, icon: 'circle', textStyle: { color: colors.gray } },
      series: [
        {
          type: 'pie',
          radius: ['48%', '72%'], // donut: part-to-whole at a glance, 4 segments
          center: ['50%', '44%'],
          label: { show: false },
          // A 2px surface gap between fills, not a border around each slice.
          itemStyle: { borderColor: colors.white, borderWidth: 2 },
          data: slices.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: s.color } })),
        },
      ],
    };
  }, [data, t]);

  /* Revenue by category — a BAR, not a pie. Comparing revenue across categories
   * is a comparison task, and a pie is only honest for part-to-whole at a
   * glance. One series → one hue (a darker-where-bigger ramp would double-encode
   * bar length as colour and burn the only free channel). */
  const categoryOption = useMemo<EChartsOption>(() => {
    const cats = [...(data?.categories ?? [])].sort((a, b) => b.revenue - a.revenue);
    return {
      grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
      tooltip: { trigger: 'item', valueFormatter: (v) => fmtMoney(Number(v)) },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: colors.muted } }, axisLabel: { show: false } },
      yAxis: {
        type: 'category',
        data: cats.map((c) => c.name).reverse(),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: colors.gray },
      },
      series: [
        {
          type: 'bar',
          barWidth: 14,
          itemStyle: { color: colors.leaf, borderRadius: [0, 4, 4, 0] },
          // Direct-labelled: only three bars, and the value is the point.
          label: {
            show: true,
            position: 'right',
            color: colors.gray,
            formatter: (p) => fmtMoney(Number(p.value)),
          },
          data: cats.map((c) => c.revenue).reverse(),
        },
      ],
    };
  }, [data]);

  const s = data?.summary;
  const updated = data?.generated_at
    ? new Date(data.generated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">{t('admin.exec.title')}</h1>
          <p className="text-xs text-fg-muted">
            {t('admin.exec.subtitle')}
            {updated ? ` · ${t('admin.exec.updated', { time: updated })}` : ''}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void load(trend)} disabled={loading}>
          {t('admin.exec.refresh')}
        </Button>
      </header>

      {error ? (
        <div role="alert" className="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-fg">
          {/* A 403 here means the signed-in admin is not an executive role. */}
          {/403|restricted/i.test(error) ? t('admin.exec.denied') : error}
        </div>
      ) : null}

      {/* ── Headline ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon="💰" label={t('admin.exec.kpi.revenueToday')} value={fmtMoney(s?.revenue_today ?? 0)} />
        <StatTile icon="📅" label={t('admin.exec.kpi.revenueMtd')} value={fmtMoney(s?.revenue_mtd ?? 0)} />
        <StatTile icon="📈" label={t('admin.exec.kpi.revenueYtd')} value={fmtMoney(s?.revenue_ytd ?? 0)} />
        <StatTile icon="🛒" label={t('admin.exec.kpi.gmv')} value={fmtMoney(s?.gmv ?? 0)} />
        <StatTile icon="📦" label={t('admin.exec.kpi.totalOrders')} value={s?.total_orders ?? 0} />
        <StatTile icon="🗺️" label={t('admin.exec.kpi.activeDistricts')} value={s?.active_districts ?? 0} />
        <GrowthTile label={t('admin.exec.kpi.orderGrowth')} pct={s?.order_growth_pct} />
        <GrowthTile label={t('admin.exec.kpi.customerGrowth')} pct={s?.customer_growth_pct} />
        <GrowthTile label={t('admin.exec.kpi.farmerGrowth')} pct={s?.farmer_growth_pct} />
      </section>

      {/* ── Districts: map + its table view ──────────────────────────────── */}
      <ChartContainer
        title={t('admin.exec.districts.title')}
        subtitle={t('admin.exec.districts.sub')}
        loading={loading && !data}
        empty={!loading && districts.length === 0}
        height="auto"
        footer={<p className="text-xs text-fg-muted">{t('admin.exec.districts.tnOnly')}</p>}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            {mapState === 'unavailable' ? (
              <p className="rounded-lg border border-dashed border-subtle p-8 text-center text-sm text-fg-muted">
                {t('admin.exec.districts.mapUnavailable')}
              </p>
            ) : (
              <TnDistrictMap
                districts={districts}
                onSelect={onSelectDistrict}
                onStateChange={setMapState}
              />
            )}
            <Legend t={t} />
            {drill ? (
              <p className="mt-3 rounded-lg bg-surface-muted p-3 text-sm">
                <strong className="text-primary">{drill.district}</strong> ·{' '}
                {fmtMoney(drill.revenue)} · {drill.orders} {t('admin.exec.orders.title').toLowerCase()}
              </p>
            ) : null}
          </div>

          {/* The map's TABLE VIEW — always rendered. It is the only place a
              non-TN district can appear, and the only thing that still works if
              the GeoJSON fails to load. */}
          <div>
            <h3 className="mb-2 text-sm font-bold text-fg">{t('admin.exec.districts.rank')}</h3>
            <ol className="list-none space-y-1">
              {districts.map((d, i) => (
                <li key={d.district}>
                  <button
                    type="button"
                    onClick={() => setDrill(d)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
                  >
                    <span className="w-5 text-xs font-bold text-fg-muted tabular-nums">{i + 1}</span>
                    <ToneDot tone={districtTone(d.status)} />
                    <span className="flex-1 truncate text-fg">{d.district}</span>
                    <span className="tabular-nums text-fg-muted">{fmtMoney(d.revenue)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </ChartContainer>

      {/* ── Revenue trend ────────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.exec.trend.title')}
        loading={loading && !data}
        empty={!loading && (data?.trend.points.length ?? 0) === 0}
        action={
          <div className="flex gap-1" role="group" aria-label={t('admin.exec.trend.title')}>
            {TREND_MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={trend === m}
                onClick={() => setTrend(m)}
                className={
                  'rounded-full px-3 py-1 text-xs font-bold ' +
                  (trend === m
                    ? 'bg-primary text-primary-on'
                    : 'bg-surface-muted text-fg-muted hover:text-primary')
                }
              >
                {t(`admin.exec.trend.${m}`)}
              </button>
            ))}
          </div>
        }
      >
        <EChart option={trendOption} />
      </ChartContainer>

      {/* ── Orders + Customers ───────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer
          title={t('admin.exec.orders.byStatus')}
          loading={loading && !data}
          empty={!loading && (data?.summary.total_orders ?? 0) === 0}
        >
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            <StatTile label={t('admin.exec.orders.today')} value={data?.orders.today ?? 0} />
            <StatTile label={t('admin.exec.orders.delivered')} value={data?.orders.delivered ?? 0} />
            <StatTile label={t('admin.exec.orders.pending')} value={data?.orders.pending ?? 0} />
            <StatTile label={t('admin.exec.orders.cancelled')} value={data?.orders.cancelled ?? 0} />
            <StatTile label={t('admin.exec.orders.refunded')} value={data?.orders.refunded ?? 0} />
          </div>
          <EChart option={ordersOption} height={260} />
        </ChartContainer>

        <ChartContainer title={t('admin.exec.customers.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-2 gap-3">
            <StatTile icon="🆕" label={t('admin.exec.customers.new')} value={data?.customers.new ?? 0} />
            <StatTile icon="🔁" label={t('admin.exec.customers.repeat')} value={data?.customers.repeat ?? 0} />
            <StatTile icon="💚" label={t('admin.exec.customers.retention')} value={`${data?.customers.retention_pct ?? 0}%`} />
            <StatTile icon="🧺" label={t('admin.exec.customers.avgBasket')} value={fmtMoney(data?.customers.avg_basket ?? 0)} />
          </div>
        </ChartContainer>
      </div>

      {/* ── Farmers + Categories ─────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer title={t('admin.exec.farmers.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label={t('admin.exec.farmers.registered')} value={data?.farmers.registered ?? 0} />
            <StatTile label={t('admin.exec.farmers.active')} value={data?.farmers.active ?? 0} />
            <StatTile label={t('admin.exec.farmers.inactive')} value={data?.farmers.inactive ?? 0} />
            <StatTile label={t('admin.exec.farmers.avgRating')} value={data?.farmers.avg_rating ?? '—'} />
          </div>
          {(data?.farmers.top ?? []).length ? (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-bold text-fg">{t('admin.exec.farmers.top')}</h3>
              <ol className="list-none space-y-1">
                {data!.farmers.top.map((f, i) => (
                  <li key={f.farmer_id} className="flex items-center gap-3 text-sm">
                    <span className="w-5 text-xs font-bold text-fg-muted tabular-nums">{i + 1}</span>
                    <span className="flex-1 truncate text-fg">{f.name}</span>
                    <span className="tabular-nums text-fg-muted">{fmtMoney(f.revenue)}</span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </ChartContainer>

        <ChartContainer
          title={t('admin.exec.categories.title')}
          loading={loading && !data}
          empty={!loading && (data?.categories.length ?? 0) === 0}
          height="auto"
        >
          <EChart option={categoryOption} height={Math.max(160, (data?.categories.length ?? 1) * 56)} />
        </ChartContainer>
      </div>

      {/* ── Logistics + Financial ────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartContainer title={t('admin.exec.logistics.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile
              label={t('admin.exec.logistics.avgDelivery')}
              value={data?.logistics.avg_delivery_mins != null ? `${data.logistics.avg_delivery_mins} min` : '—'}
            />
            <StatTile label={t('admin.exec.logistics.late')} value={data?.logistics.late_deliveries ?? 0} />
            <StatTile
              label={t('admin.exec.logistics.sla')}
              value={data?.logistics.sla_pct != null ? `${data.logistics.sla_pct}%` : '—'}
            />
          </div>
        </ChartContainer>

        <ChartContainer title={t('admin.exec.financial.title')} loading={loading && !data} height="auto">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile label={t('admin.exec.financial.commission')} value={fmtMoney(data?.financial.platform_commission ?? 0)} />
            <StatTile label={t('admin.exec.financial.deliveryIncome')} value={fmtMoney(data?.financial.delivery_income ?? 0)} />
            <StatTile label={t('admin.exec.financial.subscriptionIncome')} value={fmtMoney(data?.financial.subscription_income ?? 0)} />
            <StatTile label={t('admin.exec.financial.payoutsPending')} value={fmtMoney(data?.financial.payouts_pending ?? 0)} />
            <StatTile label={t('admin.exec.financial.payoutsPaid')} value={fmtMoney(data?.financial.payouts_paid ?? 0)} />
          </div>
        </ChartContainer>
      </div>

      {/* ── Alerts ───────────────────────────────────────────────────────── */}
      <ChartContainer title={t('admin.exec.alerts.title')} loading={loading && !data} height="auto">
        {(data?.alerts ?? []).length === 0 ? (
          <p className="text-sm text-fg-muted">{t('admin.exec.alerts.none')}</p>
        ) : (
          <ul className="space-y-2">
            {data!.alerts.map((a, i) => (
              <li key={`${a.type}-${i}`} className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-sm">
                {/* Severity carries an icon + the message, never colour alone. */}
                <ToneDot tone={alertTone(a.severity)} />
                <span className="text-fg">{a.message}</span>
              </li>
            ))}
          </ul>
        )}
      </ChartContainer>

      {/* ── Not yet wired up ─────────────────────────────────────────────────
          The metrics the board asked for that no system feeds yet. They sit at
          the BOTTOM, below every live figure, because that is what they are
          worth today — but they are shown, not hidden, so the board can see
          what is coming and what it is still waiting on. */}
      <PlaceholderSection
        placeholders={data?.placeholders}
        title={t('admin.exec.ph.title')}
        subtitle={t('admin.exec.ph.sub')}
        loading={loading && !data}
      />
    </div>
  );
}

/* A growth number reads as a gain unless the sign is loud, so the sign is loud:
 * an explicit +/− and an arrow, never colour alone. */
function GrowthTile({ label, pct }: { label: string; pct?: number }) {
  const dir = growthDirection(pct);
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•';
  const accent =
    dir === 'up' ? semantic.light.success : dir === 'down' ? semantic.light.danger : colors.gray;
  return <StatTile icon={arrow} label={label} value={formatGrowth(pct)} accent={accent} />;
}

function ToneDot({ tone }: { tone: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const fill =
    tone === 'success' ? semantic.light.success
    : tone === 'warning' ? semantic.light.warning
    : tone === 'danger' ? semantic.light.danger
    : colors.gray;
  return (
    <span
      aria-hidden="true"
      className="mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ background: fill }}
    />
  );
}

function Legend({ t }: { t: (k: string) => string }) {
  const items = [
    { tone: 'success' as const, label: t('admin.exec.legend.performing') },
    { tone: 'warning' as const, label: t('admin.exec.legend.moderate') },
    { tone: 'danger' as const, label: t('admin.exec.legend.attention') },
    { tone: 'neutral' as const, label: t('admin.exec.legend.nodata') },
  ];
  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.tone} className="flex items-center gap-1.5 text-xs text-fg-muted">
          <ToneDot tone={i.tone} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
