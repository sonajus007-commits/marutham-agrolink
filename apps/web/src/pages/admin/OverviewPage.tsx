import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChartContainer, Select, StatTile } from '@marutham/ui';
import { api, type DashboardResponse } from '@marutham/api-client';
import { fmtMoney, fmtMoneyInt } from '@marutham/lib';
import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';
import { useAuth } from '../../auth/AuthContext';
import { EChart } from '../../components/EChart';

/* admin_roles whose Overview is locked to their own geography — they cannot pick
 * a state/district, so the dropdowns are hidden (the server ignores their params
 * too). Everyone else runs the whole company and may drill down. */
const GEO_LOCKED_ROLES = ['District Manager', 'Hub Incharge', 'VCO', 'Delivery Agent'];
/** The default state the Overview opens on — overridden if the DB lacks it. */
const DEFAULT_STATE = 'Tamil Nadu';

/**
 * The admin Overview. GET /dashboard is role-scoped server-side, so the same
 * page serves every management tier — Head Office sees the company, a District
 * Manager sees their district. Money: kpis.gmv_rupees is already rupees, but
 * daily_trend[].revenue is PAISE (it is not a money-middleware field), so the
 * trend divides by 100. Verified against the live endpoint.
 */
export function OverviewPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Whether this role may drill down by state/district.
  const canFilter = !GEO_LOCKED_ROLES.includes(user?.admin_role || '');

  // State → District → taluk[] tree for the dropdowns, and the current picks.
  // District '' means "all districts in the state" — the default overall view.
  const [tree, setTree] = useState<Record<string, Record<string, string[]>>>({});
  const [stateSel, setStateSel] = useState(DEFAULT_STATE);
  const [districtSel, setDistrictSel] = useState('');

  // Load the location tree once, for filterable roles only. If the default state
  // is missing from the DB, fall back to the first one so the dropdown is valid.
  useEffect(() => {
    if (!canFilter) return;
    let live = true;
    api
      .getLocations()
      .then((r) => {
        if (!live) return;
        const tr = r.tree || {};
        setTree(tr);
        setStateSel((cur) => (tr[cur] ? cur : Object.keys(tr)[0] || cur));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [canFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = canFilter
        ? { state: stateSel || undefined, district: districtSel || undefined }
        : undefined;
      setData(await api.getDashboard(params));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard');
    } finally {
      setLoading(false);
    }
  }, [canFilter, stateSel, districtSel]);

  useEffect(() => {
    void load();
  }, [load]);

  const states = useMemo(() => Object.keys(tree), [tree]);
  const districts = useMemo(
    () => (tree[stateSel] ? Object.keys(tree[stateSel]) : []),
    [tree, stateSel],
  );

  const k = data?.kpis;

  const trendOption = useMemo<EChartsOption>(() => {
    const trend = data?.daily_trend ?? [];
    return {
      // ONE series → slot 0, like top-products below. Handing a single-series chart
      // the whole palette was decoration: ECharts only ever reads color[0].
      color: [chartPalette.light[0]],
      // The series is already rounded to whole rupees below, so fmtMoneyInt — a
      // forced ".00" here would be precision the number does not have.
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtMoneyInt(v) },
      grid: { left: 48, right: 16, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: trend.map((p) => p.day_label),
        axisLine: { lineStyle: { color: colors.border } },
        axisLabel: { fontWeight: 'bold' },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: colors.muted } } },
      series: [
        {
          name: t('admin.overview.revenue'),
          type: 'bar',
          // daily_trend.revenue is paise — see the note above.
          data: trend.map((p) => Math.round(p.revenue / 100)),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
          // The value rides on top of every bar, not just on hover.
          label: {
            show: true,
            position: 'top',
            formatter: (p) => fmtMoneyInt(p.value),
            fontSize: 10,
            color: colors.gray,
          },
        },
      ],
    };
  }, [data, t]);

  const statusOption = useMemo<EChartsOption>(() => {
    const entries = Object.entries(data?.status_breakdown ?? {});
    return {
      // Order STATUS is one series of counts, not five identities — the bar length
      // is the message. Colouring each status separately would spend the identity
      // channel re-encoding what the axis label already says.
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'item' },
      grid: { left: 48, right: 16, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: entries.map(([s]) => s),
        axisLabel: { interval: 0, fontSize: 10, fontWeight: 'bold' },
        axisLine: { lineStyle: { color: colors.border } },
      },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: colors.muted } } },
      series: [
        {
          name: t('admin.overview.orders'),
          type: 'bar',
          data: entries.map(([, n]) => n),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
          // The count sits above each bar, always visible.
          label: { show: true, position: 'top', fontSize: 11, color: colors.gray },
        },
      ],
    };
  }, [data, t]);

  /* Top products — ranked magnitude, so horizontal bars read fastest (the labels
   * sit flat and the eye compares lengths against one baseline).
   *
   * ONE series → ONE colour for every bar. Colouring each product differently, or
   * ramping the hue with the value, would double-encode length as colour and burn
   * the only free channel on nothing — colour belongs to an entity, never to a
   * rank. No legend for a single series: the title already says what is plotted,
   * and the value rides the tip of each bar. Bars are drawn from the shortest at
   * the bottom, so ECharts' inverted category axis puts the biggest on top.
   *
   * `revenue` is PAISE (like daily_trend) — divide by 100. */
  const topProductsOption = useMemo<EChartsOption>(() => {
    const top = [...(data?.top_products ?? [])].sort((a, b) => a.revenue - b.revenue);
    return {
      color: [chartPalette.light[0]],
      tooltip: {
        trigger: 'item',
        valueFormatter: (v) => fmtMoneyInt(v),
      },
      grid: { left: 8, right: 64, top: 8, bottom: 8, containLabel: true },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { show: false },
      },
      yAxis: {
        type: 'category',
        data: top.map((p) => p.name),
        axisLine: { lineStyle: { color: colors.border } },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: colors.gray, fontWeight: 'bold' },
      },
      series: [
        {
          name: t('admin.overview.revenue'),
          type: 'bar',
          data: top.map((p) => Math.round(p.revenue / 100)),
          barMaxWidth: 24,
          // Rounded at the data end, square against the baseline.
          itemStyle: { borderRadius: [0, 4, 4, 0] },
          label: {
            show: true,
            position: 'right',
            formatter: (p) => fmtMoneyInt(p.value),
            fontSize: 11,
            // Text wears text ink, never the series colour.
            color: colors.gray,
          },
        },
      ],
    };
  }, [data, t]);

  const trendEmpty = (data?.daily_trend ?? []).every((p) => p.revenue === 0);
  const statusEmpty = Object.keys(data?.status_breakdown ?? {}).length === 0;
  const topEmpty = (data?.top_products ?? []).length === 0;

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">{t('admin.overview.title')}</h1>
      <p className="mb-3 text-sm text-fg-muted">
        {t('admin.overview.scope')}:{' '}
        <span className="font-semibold text-fg">{data?.scope || '—'}</span>
      </p>

      {/* State / District drill-down — hidden for geo-locked roles, who only ever
          see their own district. Changing a picker refetches the whole dashboard;
          picking a new state resets the district back to "all". */}
      {canFilter ? (
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wider text-fg-muted">
            {t('admin.overview.filter.state')}
            <Select
              value={stateSel}
              onChange={(e) => {
                setStateSel(e.target.value);
                setDistrictSel('');
              }}
              className="min-w-[160px]"
            >
              {states.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex flex-col gap-1 text-2xs font-bold uppercase tracking-wider text-fg-muted">
            {t('admin.overview.filter.district')}
            <Select
              value={districtSel}
              onChange={(e) => setDistrictSel(e.target.value)}
              className="min-w-[180px]"
            >
              <option value="">{t('admin.overview.filter.allDistricts')}</option>
              {districts.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </label>
        </div>
      ) : null}

      <p className="mb-4 text-xs text-fg-muted">{t('admin.overview.tapHint')}</p>

      {/* Clickable KPI tiles — each opens the records behind the number, the same
          way the consumer/farmer Home tiles drill into their lists. The tile is a
          <button> whenever onClick is present (see StatTile). */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile
          icon="📦"
          label={t('admin.overview.kpi.orders')}
          value={k?.total_orders ?? '—'}
          hint={t('admin.overview.kpi.ordersHint')}
          onClick={() => navigate('/admin/orders')}
        />
        <StatTile
          icon="💰"
          label={t('admin.overview.kpi.gmv')}
          value={k ? fmtMoney(k.gmv_rupees) : '—'}
          hint={t('admin.overview.kpi.gmvHint')}
          accent="var(--success)"
          onClick={() => navigate('/admin/payouts')}
        />
        <StatTile
          icon="🚚"
          label={t('admin.overview.kpi.active')}
          value={k?.active_orders ?? '—'}
          hint={t('admin.overview.kpi.activeHint')}
          accent="var(--info)"
          onClick={() => navigate('/admin/orders')}
        />
        <StatTile
          icon="🌾"
          label={t('admin.overview.kpi.farmers')}
          value={k?.total_farmers ?? '—'}
          hint={t('admin.overview.kpi.farmersHint')}
          onClick={() => navigate('/admin/users?kind=farmer')}
        />
        <StatTile
          icon="🛒"
          label={t('admin.overview.kpi.consumers')}
          value={k?.total_consumers ?? '—'}
          hint={t('admin.overview.kpi.consumersHint')}
          onClick={() => navigate('/admin/users?kind=consumer')}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartContainer
          title={t('admin.overview.revenueTrend')}
          loading={loading}
          error={error || undefined}
          empty={!loading && !error && trendEmpty ? t('admin.overview.noRevenue') : false}
          height={280}
        >
          <EChart option={trendOption} height={280} />
        </ChartContainer>

        <ChartContainer
          title={t('admin.overview.ordersByStatus')}
          loading={loading}
          error={error || undefined}
          empty={!loading && !error && statusEmpty ? t('admin.overview.noOrders') : false}
          height={280}
        >
          <EChart option={statusOption} height={280} />
        </ChartContainer>
      </div>

      {/* Top products — full width: the product names need the horizontal room. */}
      <div className="mt-4">
        <ChartContainer
          title={t('admin.overview.topProducts')}
          loading={loading}
          error={error || undefined}
          empty={!loading && !error && topEmpty ? t('admin.overview.noTopProducts') : false}
          height={260}
        >
          <EChart option={topProductsOption} height={260} />
        </ChartContainer>
      </div>
    </>
  );
}
