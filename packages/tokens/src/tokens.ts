/*
 * Typed token values — for JS/TS use (e.g. ECharts theming) and future
 * React Native. Keep in sync with tokens.css (same hex values).
 */
export const colors = {
  forest: '#1a3d2b',
  leaf: '#4E9F3D',
  sage: '#74C25C',
  mint: '#A8D5A2',
  bloom: '#CB4E86',
  bloomLight: '#FDEDF5',
  cream: '#f7f3ee',
  gold: '#d4a843',
  gold2: '#e9c46a',
  sun: '#f4a261',
  red: '#c0392b',
  redbg: '#fde8e8',
  green: '#1a7a4a',
  greenbg: '#e8f7e8',
  gray: '#5a6472',
  border: '#BFE0B5',
  white: '#fff',
  light: '#f3f8f1',
  muted: '#f0f4ee',
  text: '#1c2820',
} as const;

export const radius = {
  base: '12px',
  sm: '8px',
} as const;

export const shadow = {
  base: '0 2px 16px rgba(26, 61, 43, .09)',
  md: '0 6px 32px rgba(26, 61, 43, .13)',
} as const;

/* Ordered categorical palette for charts (leaf → gold → bloom → forest …). */
export const chartPalette = [
  colors.leaf,
  colors.gold,
  colors.bloom,
  colors.forest,
  colors.sun,
  colors.sage,
] as const;
