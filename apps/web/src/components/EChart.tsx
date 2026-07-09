import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

/* Thin wrapper around the existing ECharts investment. Real dashboards reuse
 * this same component; here it proves charts render inside the React app. */
export function EChart({ option, height = 320 }: { option: EChartsOption; height?: number }) {
  return <ReactECharts option={option} style={{ height, width: '100%' }} notMerge lazyUpdate />;
}
