// ECharts 6 ships a new default theme (axis, grid, tooltip and legend styling).
// Charts here were designed against the v5 look, and series colours already come
// from `chartPalette`, so keep v5 until the charts are restyled on purpose — a
// dependency upgrade should not redesign every dashboard as a side effect.
import 'echarts/theme/v5';

export const ECHARTS_THEME = 'v5';
