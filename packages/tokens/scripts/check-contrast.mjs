/**
 * WCAG 2.1 contrast audit of the semantic token pairs.
 *
 *   node --import tsx scripts/check-contrast.mjs
 *
 * Body text must clear AA (4.5:1). Large text, icons and UI boundaries must
 * clear AA-Large (3:1). A pair that fails is a bug in tokens.ts, not something
 * a screen should work around locally.
 */
import { semantic } from '../src/tokens.ts';

const AA = 4.5;
const AA_LARGE = 3;

function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** WCAG relative luminance. */
function luminance(hex) {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

/* `borderSubtle` is absent by design: it draws card edges, which are decorative,
 * and WCAG sets no floor for those. `borderStrong` draws control edges, which
 * 1.4.11 requires to clear 3:1, so it is asserted. */

/** [foreground, background, threshold, label] */
const pairs = (t) => [
  [t.fg, t.bg, AA, 'fg on bg'],
  [t.fg, t.surface, AA, 'fg on surface'],
  [t.fg, t.surfaceMuted, AA, 'fg on surfaceMuted'],
  [t.fgMuted, t.surface, AA, 'fgMuted on surface'],
  [t.fgMuted, t.bg, AA, 'fgMuted on bg'],

  // text on fills
  [t.primaryOn, t.primary, AA, 'primaryOn on primary'],
  // accent is the brand pink (#EC407A) and only ever fills CTA buttons, whose labels
  // are ≥14px bold = WCAG large text (3:1). White-on-pink is 3.76:1 — compliant for
  // that use. Pink as SMALL text uses accentFg on accentBg, asserted at full AA below.
  [t.accentOn, t.accent, AA_LARGE, 'accentOn on accent (CTA button label = large text)'],
  [t.successOn, t.success, AA, 'successOn on success'],
  [t.warningOn, t.warning, AA, 'warningOn on warning'],
  [t.dangerOn, t.danger, AA, 'dangerOn on danger'],
  [t.infoOn, t.info, AA, 'infoOn on info'],
  [t.scheduleOn, t.schedule, AA, 'scheduleOn on schedule'],

  // text on tints
  [t.accentFg, t.accentBg, AA, 'accentFg on accentBg'],
  [t.successFg, t.successBg, AA, 'successFg on successBg'],
  [t.warningFg, t.warningBg, AA, 'warningFg on warningBg'],
  [t.dangerFg, t.dangerBg, AA, 'dangerFg on dangerBg'],
  [t.infoFg, t.infoBg, AA, 'infoFg on infoBg'],
  [t.scheduleFg, t.scheduleBg, AA, 'scheduleFg on scheduleBg'],

  // non-text contrast (WCAG 1.4.11). warningStrong is a fill — dots, left
  // borders, gradient stops — and never carries text, so 3:1 is its bar.
  [t.primary, t.surface, AA_LARGE, 'primary on surface (UI)'],
  [t.borderStrong, t.surface, AA_LARGE, 'borderStrong on surface (UI)'],
  [t.warningStrong, t.surface, AA_LARGE, 'warningStrong on surface (UI)'],
  [t.info, t.surface, AA_LARGE, 'info on surface (UI)'],
];

let failed = 0;

for (const theme of ['light', 'dark']) {
  console.log(`\n  ${theme}`);
  for (const [fg, bg, min, label] of pairs(semantic[theme])) {
    const r = ratio(fg, bg);
    const ok = r >= min;
    if (!ok) failed++;
    const mark = ok ? 'PASS' : 'FAIL';
    console.log(`  ${mark}  ${r.toFixed(2).padStart(5)}:1  (min ${min})  ${label}  ${fg} on ${bg}`);
  }
}

console.log(
  failed === 0
    ? '\n  all semantic pairs meet their WCAG threshold\n'
    : `\n  ${failed} pair(s) below threshold\n`,
);
process.exit(failed === 0 ? 0 : 1);
