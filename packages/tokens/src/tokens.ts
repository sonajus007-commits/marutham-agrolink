/**
 * Marutham AgroLink — design tokens. THIS FILE IS THE SOURCE OF TRUTH.
 *
 * `tokens.css` is generated from it (`pnpm tokens:build`) and CI fails if the
 * two drift (`pnpm tokens:check`). Never hand-edit `tokens.css`. Values are
 * plain strings with no DOM dependency, so React Native can consume this module
 * directly.
 *
 * Layers, in the order you should reach for them:
 *   1. `semantic`  — role-based (bg, fg, primary, danger…). Use this.
 *   2. `tint` / `neutral` / `statusPalette` — scales, when no role fits.
 *   3. `colors`    — raw brand primitives. Avoid outside this file.
 */

/* ── Primitives ─────────────────────────────────────────────────────────────
 * Brand hexes, unchanged since the original app.css. `forestDark`, `forestSoft`
 * and `redDark` were previously inlined at call sites; they are named here so
 * the hover and gradient states are part of the system rather than folklore. */
export const colors = {
  forest: '#1a3d2b', // deep paddy green — primary dark
  forestSoft: '#2d6a4f', // gradient partner for forest
  forestDark: '#16351f', // primary button hover
  leaf: '#4E9F3D', // fresh leaf green — links, active, highlights
  sage: '#74C25C', // mid leaf — borders, accents
  mint: '#A8D5A2', // light leaf — subtle tints

  bloom: '#CB4E86', // marutham flower pink — the signature accent
  bloomLight: '#FDEDF5', // bloom background tint

  forestDeep: '#0f2d1c', // login radial-gradient inner stop
  forestNight: '#0a1f12', // login radial-gradient outer stop

  cream: '#f7f3ee',
  gold: '#d4a843',
  gold2: '#e9c46a',
  sun: '#f4a261',

  red: '#c0392b',
  redDark: '#a83226', // danger button hover
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

/* ── Tint ramp ──────────────────────────────────────────────────────────────
 * The app grew ~20 near-identical pale greens (#f0faf4, #f3faf4, #f8fdf8, …)
 * that no eye can tell apart. This is the canonical ladder they collapse into.
 * Nothing consumes it yet — the substitution lands in a follow-up commit so the
 * visual diff can be reviewed on its own. */
export const tint = {
  25: '#fafdfa',
  50: '#f8fdf8',
  100: '#f3faf4',
  200: '#eef4ee',
  300: '#dde8dd',
  400: '#cfe3cf',
  500: '#bfe0b5', // === colors.border
} as const;

/* Cool greys, for structure that must read as inert next to the greens:
 * timeline rails, progress troughs, unmet checklist dots. */
export const neutral = {
  200: '#e2e8f0',
  300: '#cbd5e1',
  400: '#94a3b8',
  700: '#374151',
} as const;

/* ── Order status ───────────────────────────────────────────────────────────
 * Consumed by `statusColor()` in @marutham/lib, which is where these hexes
 * used to live — colour values in pure business logic. Keys are the exact
 * status strings the API returns. */
export const statusPalette = {
  'Order Placed': colors.sun,
  Packaged: colors.gold2,
  'VCO Verified': '#52b788',
  'Picked Up': colors.forestSoft,
  'Out for Delivery': colors.green,
  Delivered: '#155e38',
  'In Transit': '#3a86ff',
  'At Hub': '#8338ec',
  Cancelled: colors.red,
} as const;

/** Fallback for an unrecognised status. */
export const statusFallback = colors.gray;

/* ── Semantic roles ─────────────────────────────────────────────────────────
 * The only layer screens should name. Each status role carries four values:
 *
 *   <role>      fill colour
 *   <role>On    text drawn ON that fill
 *   <role>Bg    pale tint, for banners and badges
 *   <role>Fg    text drawn ON that tint
 *
 * `scripts/check-contrast.mjs` asserts every one of those pairs against WCAG AA.
 * Dark is authored, not derived, and is opt-in via [data-theme='dark'] — binding
 * it to prefers-color-scheme would flip every dark-OS user to an unreviewed
 * theme the moment this file ships. Bind it after a design review.
 *
 * `borderSubtle` is decorative (card edges) and carries no contrast floor.
 * `borderStrong` is for control edges — inputs, checkboxes — where WCAG 1.4.11
 * requires 3:1. Today's inputs use #d5e8d0, which is 1.29:1 against white and
 * therefore fails; migrating them to `borderStrong` is a follow-up commit
 * because it changes how the forms look. */
export const semantic = {
  light: {
    bg: '#f3faf4',
    surface: colors.white,
    surfaceRaised: colors.white,
    surfaceMuted: tint[200],
    borderSubtle: colors.border,
    borderStrong: '#6f8a74',
    fg: colors.text,
    fgMuted: colors.gray,

    primary: colors.forest,
    primaryOn: colors.white,
    primaryHover: colors.forestDark,

    /* Not `colors.bloom`. The brand pink (#CB4E86) tops out at 4.22:1 against
     * white and 3.62:1 against charcoal — it cannot legibly carry text at any
     * normal size. This is bloom darkened just far enough to clear AA (5.09:1
     * on white). Reach for `--bloom` itself only for decoration: gradients,
     * illustration, large display type. */
    accent: '#b8437a',
    accentOn: colors.white,
    accentBg: colors.bloomLight,
    accentFg: '#a83a6d',

    success: colors.green,
    successOn: colors.white,
    successBg: colors.greenbg,
    successFg: colors.green,

    warning: colors.gold,
    warningOn: colors.text, // white on gold is 2.21:1 — gold takes dark text
    warningStrong: '#d97706', // amber fill: dots, left borders, gradients. Never text.
    warningBg: '#fff8e6',
    warningFg: '#92400e',

    danger: colors.red,
    dangerOn: colors.white,
    dangerBg: colors.redbg,
    dangerFg: colors.red,

    /* Neither blue nor violet is in the brand palette, and both earned their
     * place: `info` marks neutral notices (info toast, retailer badge, the
     * agent's verify queue); `schedule` marks time-bound things (an order-by
     * cutoff, a pickup window). They were already in the app as raw Tailwind
     * hexes — this names them. */
    info: '#1d4ed8',
    infoOn: colors.white,
    infoBg: '#eff6ff',
    infoFg: '#1d4ed8',

    schedule: '#7c3aed',
    scheduleOn: colors.white,
    scheduleBg: '#f5f0ff',
    scheduleFg: '#7c3aed',

    /* WCAG 1.4.3 exempts inactive controls from contrast, so this pair carries
     * no floor and keeps its original values. */
    disabledBg: '#cbd5c9',
    disabledFg: '#8a978c',

    focusRing: 'rgba(78, 159, 61, .12)',
  },
  dark: {
    bg: '#0e1512',
    surface: '#17211c',
    surfaceRaised: '#1e2a23',
    surfaceMuted: '#1c2a22',
    borderSubtle: '#2d3f35',
    borderStrong: '#5c7a67',
    fg: '#e7efe9',
    fgMuted: '#9daea3',

    primary: colors.sage, // leaf is too dark to carry text on a dark surface
    primaryOn: '#0e1512',
    primaryHover: colors.mint,

    accent: '#E86FA4', // bloom, lifted for contrast on dark
    accentOn: '#0e1512',
    accentBg: '#3a1f2c',
    accentFg: '#E86FA4',

    success: '#5fbf87',
    successOn: '#0e1512',
    successBg: '#12291d',
    successFg: '#5fbf87',

    warning: colors.gold2,
    warningOn: '#0e1512',
    warningStrong: '#f59e0b',
    warningBg: '#2e2412',
    warningFg: colors.gold2,

    danger: '#ef6b5e',
    dangerOn: '#0e1512',
    dangerBg: '#331916',
    dangerFg: '#ef6b5e',

    info: '#7aa7ff',
    infoOn: '#0e1512',
    infoBg: '#12203a',
    infoFg: '#9cc0ff',

    schedule: '#b794f6',
    scheduleOn: '#0e1512',
    scheduleBg: '#2a1f3d',
    scheduleFg: '#c4a7fb',

    disabledBg: '#2a3830',
    disabledFg: '#6b7a70',

    focusRing: 'rgba(116, 194, 92, .22)',
  },
} as const;

/* ── Typography ─────────────────────────────────────────────────────────────
 * Three families already in use: Outfit for UI, Cormorant Garamond for the
 * wordmark, Noto Serif Tamil for `ta` copy. */
export const typography = {
  fontFamily: {
    sans: "'Outfit', system-ui, sans-serif",
    serif: "'Cormorant Garamond', serif",
    tamil: "'Noto Serif Tamil', serif",
  },
  fontSize: {
    '2xs': '9px',
    xs: '10px',
    sm: '11px',
    base: '12px',
    md: '13px',
    lg: '14px',
    xl: '16px',
    '2xl': '20px',
    '3xl': '22px',
    '4xl': '26px',
  },
  fontWeight: { normal: '400', semibold: '600', bold: '700', black: '800' },
  lineHeight: { tight: '1.1', snug: '1.4', normal: '1.5' },
  letterSpacing: { normal: '0', wide: '.5px', wider: '1px' },
} as const;

/** 4px base. Half-steps exist because the current UI genuinely uses 6/10/14/18. */
export const space = {
  0: '0',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  2.5: '10px',
  3: '12px',
  3.5: '14px',
  4: '16px',
  4.5: '18px',
  5: '20px',
  6: '24px',
  7: '28px',
  8: '32px',
} as const;

/** `base` and `sm` keep their legacy CSS names (--radius, --radiussm). */
export const radius = {
  xs: '4px',
  sm: '8px',
  md: '10px',
  base: '12px',
  lg: '16px',
  xl: '20px',
  pill: '50px',
  full: '9999px',
} as const;

/** `base` and `md` keep their legacy CSS names (--shadow, --shadowmd). */
export const shadow = {
  xs: '0 2px 10px rgba(31, 107, 59, .05)',
  base: '0 2px 16px rgba(26, 61, 43, .09)',
  md: '0 6px 32px rgba(26, 61, 43, .13)',
  lg: '0 18px 50px rgba(0, 0, 0, .28)',
  xl: '0 32px 80px rgba(0, 0, 0, .4)',
} as const;

export const motion = {
  duration: { fast: '120ms', base: '200ms', slow: '300ms' },
  easing: {
    standard: 'cubic-bezier(.4, 0, .2, 1)',
    out: 'ease-out',
    linear: 'linear',
  },
} as const;

/** Named for the stacking contexts the app already relies on. */
export const zIndex = {
  base: '0',
  sticky: '1',
  sheet: '300',
  overlay: '800',
  toast: '9999',
} as const;

export const breakpoint = {
  sm: '480px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

/** Ordered categorical palette for charts (leaf → gold → bloom → forest …). */
export const chartPalette = [
  colors.leaf,
  colors.gold,
  colors.bloom,
  colors.forest,
  colors.sun,
  colors.sage,
] as const;
