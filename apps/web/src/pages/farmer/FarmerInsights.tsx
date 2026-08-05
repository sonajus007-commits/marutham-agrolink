import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { EChartsOption } from 'echarts';
import { ChartContainer } from '@marutham/ui';
import { chartPalette, colors } from '@marutham/tokens';
import {
  consumerMonthlySeries,
  farmerWeeklyEarnings,
  isOrderCancelled,
  fmtMoney,
  fmtMoneyInt,
  type FarmerEarnings,
  type Order,
} from '@marutham/lib';
import { EChart } from '../../components/EChart';

const CHART_H = 240;

/**
 * Farmer Insights — the analytics band for the seller dashboard, mirroring the
 * consumer's ShoppingInsights but from the seller's side of the ledger: weekly
 * delivered earnings, orders placed per month, the live status mix, and where the
 * money sits in the payout pipeline. Everything is derived from the seller's own
 * orders + earnings, so an empty history yields empty charts, not fake trends.
 *
 * Default export so <FarmerHomeTab> can React.lazy() it — that keeps the ~1 MB
 * ECharts bundle off the dashboard's first paint until this section mounts.
 */
export default function FarmerInsights({
  orders,
  earnings,
}: {
  orders: Order[];
  earnings: FarmerEarnings;
}) {
  const { t, i18n } = useTranslation();

  // Weekly delivered earnings — the same figure the Earnings tab charts.
  const weekly = useMemo(
    () => farmerWeeklyEarnings(orders, 8, new Date(), i18n.language),
    [orders, i18n.language],
  );
  const earnEmpty = weekly.every((w) => w.amount === 0);
  const weekLabels = useMemo(() => weekly.map((w) => w.label), [weekly]);

  // Orders placed per month — consumerMonthlySeries counts orders regardless of
  // side, so only its `orders` field is used here (spend/saved are consumer-only).
  const monthly = useMemo(
    () => consumerMonthlySeries(orders, 6, new Date(), i18n.language),
    [orders, i18n.language],
  );
  const ordersEmpty = monthly.every((m) => m.orders === 0);
  const monthLabels = useMemo(() => monthly.map((m) => m.label), [monthly]);

  const earnOption = useMemo<EChartsOption>(
    () => ({
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtMoney(v as number) },
      grid: { left: 56, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        data: weekLabels,
        axisLine: { lineStyle: { color: colors.border } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { formatter: (v: number) => fmtMoneyInt(v) },
      },
      series: [
        {
          name: t('farmer.home.ins.earnings', 'Weekly earnings'),
          type: 'bar',
          data: weekly.map((w) => Math.round(w.amount)),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    }),
    [weekly, weekLabels, t],
  );

  const ordersOption = useMemo<EChartsOption>(
    () => ({
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 16, top: 16, bottom: 28 },
      xAxis: {
        type: 'category',
        data: monthLabels,
        axisLine: { lineStyle: { color: colors.border } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: colors.muted } },
      },
      series: [
        {
          name: t('farmer.home.ins.orders', 'Orders'),
          type: 'bar',
          data: monthly.map((m) => m.orders),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    }),
    [monthly, monthLabels, t],
  );

  // Live status mix. "To pack" is Order Placed; "in progress" is everything else
  // still in flight; delivered + cancelled close it out.
  const statusData = useMemo(() => {
    const placed = orders.filter(
      (o) => !isOrderCancelled(o) && String(o.status ?? '') === 'Order Placed',
    ).length;
    const inProgress = orders.filter(
      (o) =>
        !isOrderCancelled(o) &&
        o.status !== 'Delivered' &&
        String(o.status ?? '') !== 'Order Placed',
    ).length;
    const delivered = orders.filter((o) => o.status === 'Delivered' && !isOrderCancelled(o)).length;
    const cancelled = orders.filter(isOrderCancelled).length;
    return [
      { name: t('farmer.home.ins.placed', 'To pack'), value: placed, color: chartPalette.light[2] },
      {
        name: t('farmer.home.ins.inProgress', 'In progress'),
        value: inProgress,
        color: chartPalette.light[1],
      },
      {
        name: t('farmer.home.ins.delivered', 'Delivered'),
        value: delivered,
        color: chartPalette.light[0],
      },
      {
        name: t('farmer.home.ins.cancelled', 'Cancelled'),
        value: cancelled,
        color: colors.gray,
      },
    ].filter((d) => d.value > 0);
  }, [orders, t]);
  const statusEmpty = statusData.length === 0;

  const statusOption = useMemo<EChartsOption>(
    () => ({
      color: statusData.map((d) => d.color),
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, textStyle: { color: colors.gray } },
      series: [
        {
          name: t('farmer.home.ins.status', 'Order status'),
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

  // Payout pipeline — paid / pending / awaiting, straight off the earnings split.
  const payoutData = useMemo(
    () =>
      [
        {
          name: t('farmer.home.ins.paid', 'Paid'),
          value: earnings.paid,
          color: chartPalette.light[0],
        },
        {
          name: t('farmer.home.ins.pending', 'Pending'),
          value: earnings.pending,
          color: chartPalette.light[1],
        },
        {
          name: t('farmer.home.ins.awaiting', 'Awaiting'),
          value: earnings.awaiting,
          color: chartPalette.light[2],
        },
      ].filter((d) => d.value > 0),
    [earnings, t],
  );
  const payoutEmpty = payoutData.length === 0;

  const payoutOption = useMemo<EChartsOption>(
    () => ({
      color: payoutData.map((d) => d.color),
      tooltip: { trigger: 'item', valueFormatter: (v) => fmtMoney(v as number) },
      legend: { bottom: 0, textStyle: { color: colors.gray } },
      series: [
        {
          name: t('farmer.home.ins.payouts', 'Payout breakdown'),
          type: 'pie',
          radius: ['45%', '68%'],
          center: ['50%', '42%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: colors.white, borderWidth: 2 },
          label: { show: false },
          data: payoutData.map((d) => ({ name: d.name, value: Math.round(d.value) })),
        },
      ],
    }),
    [payoutData, t],
  );

  return (
    <section aria-labelledby="fm-ins-title">
      <h2 id="fm-ins-title" className="fm-section-title">
        📊 {t('farmer.home.ins.title', 'Insights')}
      </h2>
      <div className="fm-insights">
        <ChartContainer
          title={`📈 ${t('farmer.home.ins.earnings', 'Weekly Earnings')}`}
          subtitle={t('farmer.home.ins.earningsSub', 'Delivered earnings, last 8 weeks')}
          height={CHART_H}
          empty={earnEmpty ? t('farmer.home.ins.noData', 'No data yet') : false}
          summary={t('farmer.home.ins.earnings', 'Weekly earnings')}
        >
          <EChart option={earnOption} height={CHART_H} />
        </ChartContainer>

        <ChartContainer
          title={`📦 ${t('farmer.home.ins.orders', 'Orders per Month')}`}
          subtitle={t('farmer.home.ins.ordersSub', 'Orders placed, last 6 months')}
          height={CHART_H}
          empty={ordersEmpty ? t('farmer.home.ins.noData', 'No data yet') : false}
          summary={t('farmer.home.ins.orders', 'Orders per month')}
        >
          <EChart option={ordersOption} height={CHART_H} />
        </ChartContainer>

        <ChartContainer
          title={`🍩 ${t('farmer.home.ins.status', 'Order Status')}`}
          subtitle={t('farmer.home.ins.statusSub', 'Across all your orders')}
          height={CHART_H}
          empty={statusEmpty ? t('farmer.home.ins.noData', 'No data yet') : false}
          summary={t('farmer.home.ins.status', 'Order status distribution')}
        >
          <EChart option={statusOption} height={CHART_H} />
        </ChartContainer>

        <ChartContainer
          title={`💰 ${t('farmer.home.ins.payouts', 'Payout Breakdown')}`}
          subtitle={t('farmer.home.ins.payoutsSub', 'Where your money sits')}
          height={CHART_H}
          empty={payoutEmpty ? t('farmer.home.ins.noData', 'No data yet') : false}
          summary={t('farmer.home.ins.payouts', 'Payout breakdown')}
        >
          <EChart option={payoutOption} height={CHART_H} />
        </ChartContainer>
      </div>
    </section>
  );
}
