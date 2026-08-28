/* The Marutham blossom, drawn as inline SVG.
 *
 * The brand identity (public/brand/malogo-hero.jpg) centres on a pink lotus over
 * a green field. This is that flower reduced to a mark we can scatter as
 * decoration — section dividers, ticker separators, petal drift — at any size
 * and in any brand hue, without shipping a raster for each.
 *
 * Colour is passed as `fill`/`petal`/`core` so a caller stays inside the audited
 * palette (blossom-500 and gold-500 are fills, which is all this ever is). */

interface Props {
  className?: string;
  /** Petal colour. Any CSS colour; callers pass a brand fill. */
  petal?: string;
  /** Centre colour. */
  core?: string;
  /** Accessible name, if this mark is meaningful on its own. Usually decorative. */
  label?: string;
}

export function LotusMark({
  className = '',
  petal = 'currentColor',
  core = 'currentColor',
  label,
}: Props) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role={label ? 'img' : 'presentation'}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      fill="none"
    >
      {/* Eight radiating petals — four cardinal, four diagonal — around a core.
          Each petal is a lens shape (two arcs). */}
      <g fill={petal}>
        {/* top / bottom / left / right */}
        <path d="M24 4c3.2 5.2 3.2 12.8 0 18-3.2-5.2-3.2-12.8 0-18z" />
        <path d="M24 44c-3.2-5.2-3.2-12.8 0-18 3.2 5.2 3.2 12.8 0 18z" opacity="0.9" />
        <path d="M4 24c5.2-3.2 12.8-3.2 18 0-5.2 3.2-12.8 3.2-18 0z" opacity="0.9" />
        <path d="M44 24c-5.2 3.2-12.8 3.2-18 0 5.2-3.2 12.8-3.2 18 0z" opacity="0.9" />
        {/* diagonals */}
        <path d="M10 10c5.6 1.8 10.2 6.4 12 12-5.6-1.8-10.2-6.4-12-12z" opacity="0.78" />
        <path d="M38 38c-5.6-1.8-10.2-6.4-12-12 5.6 1.8 10.2 6.4 12 12z" opacity="0.78" />
        <path d="M38 10c-1.8 5.6-6.4 10.2-12 12 1.8-5.6 6.4-10.2 12-12z" opacity="0.78" />
        <path d="M10 38c1.8-5.6 6.4-10.2 12-12-1.8 5.6-6.4 10.2-12 12z" opacity="0.78" />
      </g>
      <circle cx="24" cy="24" r="4.2" fill={core} />
    </svg>
  );
}
