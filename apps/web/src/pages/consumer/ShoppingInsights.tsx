import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import { ChartContainer } from '@marutham/ui';
import { chartPalette, colors } from '@marutham/tokens';
import { consumerMonthlySeries, fmtMoney, fmtMoneyInt, isOrderCancelled } from '@marutham/lib';
import { EChart } from '../../components/EChart';
import { useOrders } from './OrdersContext';

const MONTHS = 6;
const CHART_H = 240;

/**
 * Shopping Insights — the analytics band, all derived from the buyer's own order
 * history via `consumerMonthlySeries` (spend/savings/orders) and the order groups
 * (status mix). Nothing here is fabricated: an empty history yields empty charts,
 * not zeroed-out fake trends.
 *
 * Default export so <HomeTab> can React.lazy() it — that keeps the ~1 MB ECharts
 * bundle off the dashboard's first paint until this section mounts.
 */
export default function ShoppingInsights() {
  const { t, i18n } = useTranslation();
  const { orders, groups } = useOrders();

  const series = useMemo(
    () => consumerMonthlySeries(orders, MONTHS, new Date(), i18n.language),
    [orders, i18n.language],
  );
  // Memoised (not a bare `.map`) so the chart options below stay referentially
  // stable across renders — otherwise every render minted a new axis array and
  // defeated their useMemo entirely.
  const months = useMemo(() => series.map((m) => m.label), [series]);

  const spentEmpty = series.every((m) => m.spent === 0);
  const savedEmpty = series.every((m) => m.saved === 0);
  const ordersEmpty = series.every((m) => m.orders === 0);

  // Axis chrome shared by the three time-series charts.
  const axisBase = useMemo(
    () => ({
      grid: { left: 56, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category' as const,
        data: months,
        axisLine: { lineStyle: { color: colors.border } },
      },
    }),
    [months],
  );

  const spendOption = useMemo<EChartsOption>(
    () => ({
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtMoney(v as number) },
      ...axisBase,
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { formatter: (v: number) => fmtMoneyInt(v) },
      },
      series: [
        {
          name: t('consumer.home.ins.spend', 'Monthly spending'),
          type: 'bar',
          data: series.map((m) => Math.round(m.spent)),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    }),
    [series, axisBase, t],
  );

  const savingsOption = useMemo<EChartsOption>(
    () => ({
      color: [chartPalette.light[1]],
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtMoney(v as number) },
      ...axisBase,
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { formatter: (v: number) => fmtMoneyInt(v) },
      },
      series: [
        {
          name: t('consumer.home.ins.savings', 'Savings'),
          type: 'line',
          smooth: true,
          data: series.map((m) => Math.round(m.saved)),
          areaStyle: { opacity: 0.12 },
          lineStyle: { width: 3 },
          symbolSize: 7,
        },
      ],
    }),
    [series, axisBase, t],
  );

  const ordersOption = useMemo<EChartsOption>(
    () => ({
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'axis' },
      ...axisBase,
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: colors.muted } },
      },
      series: [
        {
          name: t('consumer.home.ins.orders', 'Orders'),
          type: 'bar',
          data: series.map((m) => m.orders),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    }),
    [series, axisBase, t],
  );

  // Status mix from the live groups. Cancelled is derived the same way the order
  // list does — the flag is a column, not a status string.
  const cancelled = useMemo(() => orders.filter(isOrderCancelled).length, [orders]);
  const statusData = [
    {
      name: t('consumer.home.ins.active', 'In progress'),
      value: groups.active.length,
      color: chartPalette.light[2],
    },
    {
      name: t('consumer.home.delivered', 'Delivered'),
      value: groups.delivered.length,
      color: chartPalette.light[0],
    },
    {
      name: t('consumer.home.ins.cancelled', 'Cancelled'),
      value: cancelled,
      color: chartPalette.light[1],
    },
  ].filter((d) => d.value > 0);
  const statusEmpty = statusData.length === 0;

  const statusOption = useMemo<EChartsOption>(
    () => ({
      color: statusData.map((d) => d.color),
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: colors.gray } },
      series: [
        {
          name: t('consumer.home.ins.statusTitle', 'Order status'),
          type: 'pie',
          radius: ['45%', '68%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: colors.white, borderWidth: 2 },
          label: { show: false },
          data: statusData.map((d) => ({ name: d.name, value: d.value })),
        },
      ],
    }),
    [statusData, t],
  );

  return (
    <section aria-labelledby="cons-ins-title">
      <h2 id="cons-ins-title" className="cons-section-title">
        📊 {t('consumer.home.ins.title', 'Shopping Insights')}
      </h2>
      <div className="cons-insights">
        <ChartContainer
          title={`💰 ${t('consumer.home.ins.spend', 'Monthly Spending')}`}
          subtitle={t('consumer.home.ins.spendSub', 'Delivered orders, last 6 months')}
          height={CHART_H}
          empty={spentEmpty ? t('consumer.home.ins.noData', 'No data yet') : false}
          summary={t('consumer.home.ins.spend', 'Monthly spending')}
        >
          <EChart option={spendOption} height={CHART_H} />
        </ChartContainer>

        <ChartContainer
          title={`🎉 ${t('consumer.home.ins.savingsTitle', 'Savings Trend')}`}
          subtitle={t('consumer.home.ins.savingsSub', 'What you kept, last 6 months')}
          height={CHART_H}
          empty={savedEmpty ? t('consumer.home.ins.noData', 'No data yet') : false}
          summary={t('consumer.home.ins.savingsTitle', 'Savings trend')}
        >
          <EChart option={savingsOption} height={CHART_H} />
        </ChartContainer>

        <ChartContainer
          title={`📦 ${t('consumer.home.ins.ordersTitle', 'Orders per Month')}`}
          subtitle={t('consumer.home.ins.ordersSub', 'Orders placed, last 6 months')}
          height={CHART_H}
          empty={ordersEmpty ? t('consumer.home.ins.noData', 'No data yet') : false}
          summary={t('consumer.home.ins.ordersTitle', 'Orders per month')}
        >
          <EChart option={ordersOption} height={CHART_H} />
        </ChartContainer>

        <ChartContainer
          title={`🍩 ${t('consumer.home.ins.statusTitle', 'Order Status')}`}
          subtitle={t('consumer.home.ins.statusSub', 'Across all your orders')}
          height={CHART_H}
          empty={statusEmpty ? t('consumer.home.ins.noData', 'No data yet') : false}
          summary={t('consumer.home.ins.statusTitle', 'Order status distribution')}
        >
          <EChart option={statusOption} height={CHART_H} />
        </ChartContainer>
      </div>
    </section>
  );
}
