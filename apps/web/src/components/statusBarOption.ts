import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';

/* Orders-by-status as a ranked, horizontal bar chart.
 *
 * Horizontal because status names are long and there can be a dozen of them:
 * under a vertical bar, flat labels collide and the axis becomes unreadable.
 * Here each name gets its own row, and the eye compares lengths against one
 * baseline. Same shape as the Overview's top-products chart.
 *
 * ONE series → ONE colour. The bar length is the message, so colour is not spent
 * re-encoding what the axis label already says. */
export function statusBarOption(
  breakdown: Record<string, number> | undefined,
  seriesName?: string,
): EChartsOption {
  // Shortest first: a category axis draws upward, so the biggest lands on top.
  const entries = Object.entries(breakdown ?? {}).sort(([, a], [, b]) => a - b);
  return {
    color: [chartPalette.light[0]],
    tooltip: { trigger: 'item' },
    grid: { left: 8, right: 32, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: colors.muted } },
      axisLabel: { show: false },
    },
    yAxis: {
      type: 'category',
      data: entries.map(([status]) => status),
      axisLine: { lineStyle: { color: colors.border } },
      axisTick: { show: false },
      // interval 0: never let ECharts drop a status to make room.
      axisLabel: { interval: 0, fontSize: 11, color: colors.gray, fontWeight: 'bold' },
    },
    series: [
      {
        name: seriesName,
        type: 'bar',
        data: entries.map(([, count]) => count),
        barMaxWidth: 24,
        // Rounded at the data end, square against the baseline.
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        // The count rides the tip of each bar, always visible.
        label: { show: true, position: 'right', fontSize: 11, color: colors.gray },
      },
    ],
  };
}
