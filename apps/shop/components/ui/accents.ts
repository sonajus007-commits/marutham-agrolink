/* The brand's colour wheel, as SAFE card accents.
 *
 * Cards on this page used a single forest-green icon everywhere, which read as
 * monochrome. These cycle the full identity — blossom, water, leaf, gold, earth,
 * forest — while staying inside the audited palette:
 *
 *   • CHIP is a tinted FILL (accent at low alpha) with an INK-coloured glyph, so
 *     the icon clears contrast even though the -500 could not be text itself.
 *   • BAR and DOT are the raw -500 accents used as FILLS only (rules, dots).
 *
 * gold-500 cannot be ink at any size, so its chip glyph borrows earth-500 — the
 * same warmth, readable — exactly as the section eyebrows already do. */

export const ACCENT_CHIP = [
  'bg-blossom-500/12 text-blossom-ink',
  'bg-water-500/12 text-water-ink',
  'bg-forest-500/15 text-leaf-ink',
  'bg-gold-500/18 text-earth-500',
  'bg-earth-500/12 text-earth-500',
  'bg-forest-700/10 text-forest-700',
] as const;

export const ACCENT_BAR = [
  'bg-blossom-500',
  'bg-water-500',
  'bg-forest-500',
  'bg-gold-500',
  'bg-earth-500',
  'bg-forest-700',
] as const;

/** Hex values for tinting inline SVG (the LotusMark) per accent slot. */
export const ACCENT_HEX = [
  '#d95c8a',
  '#3e92cc',
  '#3e8e5a',
  '#d9a441',
  '#8b5e3c',
  '#1e5b43',
] as const;
