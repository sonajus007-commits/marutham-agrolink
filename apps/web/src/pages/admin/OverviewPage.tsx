import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartContainer, StatTile } from '@marutham/ui';
import { api, type DashboardResponse } from '@marutham/api-client';
import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';

/**
 * The admin Overview. GET /dashboard is role-scoped server-side, so the same
 * page serves every management tier — Head Office sees the company, a District
 * Manager sees their district. Money: kpis.gmv_rupees is already rupees, but
 * daily_trend[].revenue is PAISE (it is not a money-middleware field), so the
 * trend divides by 100. Verified against the live endpoint.
 */
export function OverviewPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const k = data?.kpis;

  const trendOption = useMemo<EChartsOption>(() => {
    const trend = data?.daily_trend ?? [];
    return {
      color: chartPalette as unknown as string[],
      tooltip: { trigger: 'axis', valueFormatter: (v) => '₹' + Number(v).toFixed(0) },
      grid: { left: 48, right: 16, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: trend.map((p) => p.day_label),
        axisLine: { lineStyle: { color: colors.border } },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: colors.muted } } },
      series: [
        {
          name: t('admin.overview.revenue'),
          type: 'bar',
          // daily_trend.revenue is paise — see the note above.
          data: trend.map((p) => Math.round(p.revenue / 100)),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [data, t]);

  const statusOption = useMemo<EChartsOption>(() => {
    const entries = Object.entries(data?.status_breakdown ?? {});
    return {
      color: chartPalette as unknown as string[],
      tooltip: { trigger: 'item' },
      grid: { left: 48, right: 16, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: entries.map(([s]) => s),
        axisLabel: { interval: 0, fontSize: 10 },
        axisLine: { lineStyle: { color: colors.border } },
      },
      yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: colors.muted } } },
      series: [
        {
          name: t('admin.overview.orders'),
          type: 'bar',
          data: entries.map(([, n]) => n),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    };
  }, [data, t]);

  const trendEmpty = (data?.daily_trend ?? []).every((p) => p.revenue === 0);
  const statusEmpty = Object.keys(data?.status_breakdown ?? {}).length === 0;

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">{t('admin.overview.title')}</h1>
      <p className="mb-4 text-sm text-fg-muted">
        {t('admin.overview.scope')}: <span className="font-semibold text-fg">{data?.scope || '—'}</span>
      </p>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label={t('admin.overview.kpi.orders')} value={k?.total_orders ?? '—'} hint={t('admin.overview.kpi.ordersHint')} />
        <StatTile label={t('admin.overview.kpi.gmv')} value={k ? '₹' + k.gmv_rupees : '—'} accent="var(--success)" />
        <StatTile label={t('admin.overview.kpi.active')} value={k?.active_orders ?? '—'} accent="var(--info)" />
        <StatTile label={t('admin.overview.kpi.farmers')} value={k?.total_farmers ?? '—'} />
        <StatTile label={t('admin.overview.kpi.consumers')} value={k?.total_consumers ?? '—'} />
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
    </>
  );
}
