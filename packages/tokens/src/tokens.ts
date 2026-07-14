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
  // Brand palette per the approved design spec (2026-07). The names are kept for
  // continuity with every downstream reference; the VALUES are the spec's hexes.
  forest: '#2E7D32', // Primary Green — primary buttons, active states, brand
  forestSoft: '#43A047', // mid green — gradient partner
  forestDark: '#1B5E20', // Dark Green — headings, sidebar active, button hover
  leaf: '#66BB6A', // Leaf Green — secondary buttons, success, highlights
  sage: '#74C25C', // mid leaf — dark-theme primary; unchanged (keeps dark AA)
  mint: '#A8D5A2', // light leaf — subtle tints; unchanged

  bloom: '#EC407A', // Marutham Pink — CTA buttons, accents, highlights
  bloomLight: '#FCE4EC', // Soft Pink — backgrounds, cards, alert sections

  forestDeep: '#14501a', // login radial-gradient inner stop
  forestNight: '#0a2b10', // login radial-gradient outer stop

  cream: '#FFF8E1', // Cream — light page background
  gold: '#FFC107', // Gold — ratings, premium badges, warnings
  gold2: '#e9c46a',
  sun: '#f4a261',

  red: '#c0392b',
  redDark: '#a83226', // danger button hover
  redbg: '#fde8e8',
  green: '#1a7a4a',
  greenbg: '#e8f7e8',
  gray: '#757575', // Text Grey — secondary text, icons, labels
  border: '#E0E0E0', // Border Grey — borders, dividers
  white: '#fff',
  light: '#f3f8f1',
  muted: '#f0f4ee',
  text: '#212121', // Text Dark — primary text
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
    bg: '#FAFAFA', // Light Background — app background (spec)
    surface: colors.white, // Cards and containers (spec)
    surfaceRaised: colors.white,
    surfaceMuted: '#F5F5F5', // neutral raised sections, matches the grey ground
    borderSubtle: colors.border, // #E0E0E0 (spec)
    borderStrong: '#6B7280', // control edges; neutral grey clearing WCAG 1.4.11 (4.9:1)
    fg: colors.text, // #212121 (spec)
    // Spec's Text Grey is #757575; on the #FAFAFA app background that is 4.41:1, a hair
    // under AA. Nudged three shades darker to clear 4.5 — visually identical, and the
    // named grey (colors.gray = #757575) is unchanged where it already passes (on white).
    fgMuted: '#6E6E6E',

    primary: colors.forest, // #2E7D32; white text = 5.13:1 (spec)
    primaryOn: colors.white,
    primaryHover: colors.forestDark, // #1B5E20

    /* accent IS the spec's Marutham Pink (#EC407A). White on it is 3.76:1 —
     * which clears WCAG AA-Large (3:1), the correct bar because `accent` only
     * ever fills CTA BUTTONS, whose labels are ≥14px bold = large text. The
     * contrast audit enforces exactly that threshold for this pair. For pink as
     * SMALL text, use `accentFg` (a deeper pink) on `accentBg`, never white-on-accent. */
    accent: colors.bloom, // #EC407A — CTA buttons, accents
    accentOn: colors.white,
    accentBg: colors.bloomLight, // #FCE4EC soft pink
    accentFg: '#AD1457', // deep pink for small text on soft pink (5.96:1)

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
    /* Heavier halo, for a marker that must read as "you are here" rather than
     * "this input has focus" — the live dot on the order timeline. */
    focusRingStrong: 'rgba(78, 159, 61, .2)',
    /** Scrim behind a modal dialog. */
    overlayScrim: 'rgba(0, 0, 0, .55)',
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
    focusRingStrong: 'rgba(116, 194, 92, .32)',
    /* Darker on dark: the surface beneath is already near-black, so a .55 scrim
     * would barely separate the dialog from its background. */
    overlayScrim: 'rgba(0, 0, 0, .7)',
  },
} as const;

/* ── Typography ─────────────────────────────────────────────────────────────
 * Three families already in use: Outfit for UI, Cormorant Garamond for the
 * wordmark, Noto Serif Tamil for `ta` copy. */
export const typography = {
  fontFamily: {
    // Spec: Outfit for headings / KPI numbers / buttons; Noto Sans for body copy,
    // tables, forms and general UI text (and it carries Tamil too).
    sans: "'Outfit', system-ui, sans-serif", // headings, display, numbers, buttons
    body: "'Noto Sans', system-ui, sans-serif", // paragraphs, tables, labels, forms
    serif: "'Cormorant Garamond', serif", // wordmark only (part of the logo)
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

/* Ordered categorical palette for charts — series IDENTITY, assigned in slot order.
 *
 * THREE SLOTS, AND THREE IS THE CEILING. It used to claim six (leaf → gold → bloom →
 * forest → sun → sage), which was three hue FAMILIES wearing six names: the greens
 * (forest/leaf/sage/mint) are one hue, the yellows (gold/gold2/sun) another. A
 * categorical palette encodes identity in HUE, so those extra slots bought nothing
 * and actively lied — `forest` sat below the chroma floor (C 0.052: it reads gray,
 * not a colour), `sun` sat outside the lightness band, and sage↔sun collapsed to
 * ΔE 9.5 under protanopia. Nothing rendered wrong only because no chart had ever
 * reached past slot 4.
 *
 * A fourth safe slot is NOT available from this brand — `red` is reserved for status
 * and must never impersonate a series, and the greys cannot carry identity. For a
 * chart with more than three categories do NOT cycle these hues (a hue must mean one
 * thing): use a single-hue ranked bar (see the Admin Head dashboard), fold the tail
 * into "Other", or use small multiples.
 *
 * Leaf and bloom are the brand primitives untouched. Only GOLD moves, and it had to:
 * #d4a843 collided with leaf under protanopia (ΔE 11.0) AND sat at 2.16:1 on the
 * light surface. Both slots below are the nearest step to the brand hue — hue angle
 * held, lightness/chroma moved — that clears every check. This is a chart-only
 * token: `colors.gold` elsewhere in the app is unchanged.
 *
 * Dark is SELECTED, not flipped — its own steps against its own surface (#17211c).
 * Flipping the light array would not do: brand leaf against the dark gold lands at
 * ΔE 9.6, inside the unsafe floor band.
 *
 * Both arrays pass the dataviz categorical validator ALL-PAIRS (lightness band,
 * chroma floor, CVD ΔE ≥ 12 under protan/deutan, ≥ 3:1 on surface) with no WARN.
 * All-pairs, not adjacent-only, because a pie or scatter can sit any two slots side
 * by side. The binding pair in both modes is gold↔leaf under protanopia, and it
 * clears by a hair (12.3 light / 12.1 dark) — do NOT hand-edit a hex without
 * re-running scripts/validate_palette.js. */
export const chartPalette = {
  light: ['#4E9F3D', '#CB4E86', '#9c7300'], // leaf, bloom, gold (darkened)
  dark: ['#519e41', '#cc4d86', '#b88e26'],
} as const;

/* Single-hue green sequential ramp for magnitude — choropleth maps, heatmaps.
 * Stops run low→high value. Each theme's near-zero step recedes toward its own
 * surface (light greens toward white, dark greens toward the dark panel), so the
 * two arrays are not reverses of each other but separately stepped for their
 * background. Both pass the dataviz ordinal validator (single hue, monotone
 * lightness, ΔL gaps ≥ 0.06, low-value step ≥ 2:1 on its surface) — do not hand-
 * edit a stop without re-running scripts/validate_palette.js. */
export const sequential = {
  light: ['#74C25C', '#479439', '#2f6a4a', '#1f4a30', '#0f2d1c'],
  dark: ['#2f6a4a', '#3d8a4f', '#4E9F3D', '#74C25C', '#A8D5A2'],
} as const;
