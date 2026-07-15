/**
 * Generates src/tokens.css from src/tokens.ts.
 *
 *   node --import tsx scripts/generate-css.mjs           → write
 *   node --import tsx scripts/generate-css.mjs --check   → exit 1 if stale
 *
 * Breakpoints are intentionally NOT emitted: custom properties cannot be used
 * in @media queries, so a `--bp-md` would be a trap. They stay TS-only.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  colors,
  tint,
  neutral,
  statusPalette,
  statusFallback,
  semantic,
  typography,
  space,
  radius,
  shadow,
  motion,
  zIndex,
} from '../src/tokens.ts';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/tokens.css');

/** bloomLight → bloom-light · gold2 → gold2 · fgOnPrimary → fg-on-primary */
const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** 'Order Placed' → order-placed */
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Numeric scale keys: 0.5 → 0-5 (a dot is illegal in a custom property name). */
const numKey = (k) => String(k).replace('.', '-');

/* Two token names predate this generator and are referenced across ui.css,
 * styles.css, three page stylesheets and the legacy site. Renaming them buys
 * nothing and breaks all of it, so they keep their original spelling. */
const LEGACY_NAMES = {
  'radius.base': '--radius',
  'radius.sm': '--radiussm',
  'shadow.base': '--shadow',
  'shadow.md': '--shadowmd',
};

const decl = (name, value) => `  ${name}: ${value};`;

function block(comment, entries) {
  return [`  /* ── ${comment} ── */`, ...entries, ''].join('\n');
}

function scale(prefix, obj, keyFn = kebab) {
  return Object.entries(obj).map(([k, v]) => decl(`--${prefix}-${keyFn(k)}`, v));
}

function render() {
  const root = [];

  root.push(
    block(
      'Brand primitives',
      Object.entries(colors).map(([k, v]) => decl(`--${kebab(k)}`, v)),
    ),
  );

  root.push(block('Tint ramp (pale greens)', scale('tint', tint, numKey)));
  root.push(block('Neutral ramp (cool greys)', scale('neutral', neutral, numKey)));

  root.push(
    block('Order status', [
      ...Object.entries(statusPalette).map(([k, v]) => decl(`--status-${slug(k)}`, v)),
      decl('--status-fallback', statusFallback),
    ]),
  );

  root.push(
    block(
      'Semantic roles (light)',
      Object.entries(semantic.light).map(([k, v]) => decl(`--${kebab(k)}`, v)),
    ),
  );

  root.push(
    block('Typography', [
      ...Object.entries(typography.fontFamily).map(([k, v]) => decl(`--font-${kebab(k)}`, v)),
      ...Object.entries(typography.fontSize).map(([k, v]) => decl(`--fs-${k}`, v)),
      ...Object.entries(typography.fontWeight).map(([k, v]) => decl(`--fw-${kebab(k)}`, v)),
      ...Object.entries(typography.lineHeight).map(([k, v]) => decl(`--lh-${kebab(k)}`, v)),
      ...Object.entries(typography.letterSpacing).map(([k, v]) => decl(`--ls-${kebab(k)}`, v)),
    ]),
  );

  root.push(block('Spacing', scale('space', space, numKey)));

  root.push(
    block('Radius', [
      ...Object.entries(radius).map(([k, v]) =>
        decl(LEGACY_NAMES[`radius.${k}`] ?? `--radius-${kebab(k)}`, v),
      ),
    ]),
  );

  root.push(
    block('Elevation', [
      ...Object.entries(shadow).map(([k, v]) =>
        decl(LEGACY_NAMES[`shadow.${k}`] ?? `--shadow-${kebab(k)}`, v),
      ),
    ]),
  );

  root.push(
    block('Motion', [
      ...Object.entries(motion.duration).map(([k, v]) => decl(`--duration-${kebab(k)}`, v)),
      ...Object.entries(motion.easing).map(([k, v]) => decl(`--ease-${kebab(k)}`, v)),
    ]),
  );

  root.push(block('Stacking', scale('z', zIndex)));

  const dark = Object.entries(semantic.dark).map(([k, v]) => decl(`--${kebab(k)}`, v));

  return `/*
 * Marutham AgroLink — design tokens.
 *
 * GENERATED FILE — DO NOT EDIT.
 * Source: packages/tokens/src/tokens.ts
 * Regenerate: pnpm tokens:build   ·   Verify: pnpm tokens:check
 *
 * Dark theme is opt-in via [data-theme='dark']. It is deliberately not bound to
 * prefers-color-scheme: every dark-OS user would flip to an unreviewed theme the
 * moment this file ships. Bind it once the dark theme has been signed off.
 */
:root {
${root.join('\n').trimEnd()}
}

[data-theme='dark'] {
${dark.join('\n')}
}
`;
}

const css = render();

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {
    console.error('tokens.css is missing. Run: pnpm tokens:build');
    process.exit(1);
  }
  if (current !== css) {
    console.error('tokens.css is out of date with tokens.ts. Run: pnpm tokens:build');
    process.exit(1);
  }
  console.log('tokens.css is in sync with tokens.ts');
} else {
  writeFileSync(OUT, css);
  console.log(`wrote ${OUT}`);
}
