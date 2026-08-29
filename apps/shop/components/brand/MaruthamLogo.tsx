/* ─────────────────────────────────────────────────────────────────────────────
 * The official Marutham AgroLink identity. The square mark (lotus + scales + MA
 * monogram) lives at public/brand/mark.png; the full illustrated badge is at
 * public/brand/malogo.png. Every surface imports <MaruthamLogo />, so the header
 * pairs the mark with the Cormorant wordmark and the mark alone covers the
 * favicon / app-icon / footer slots.
 *
 *   <MaruthamLogo />                 header default (mark + wordmark)
 *   <MaruthamLogo variant="mark" />  square mark alone (favicon, app icon, footer)
 *   <MaruthamLogo tone="onDark" />   for the forest-900 footer and CTA bands
 *
 * Callers rely on the props below — keep them.
 * ───────────────────────────────────────────────────────────────────────────── */

export type LogoTone = 'onLight' | 'onDark';
export type LogoVariant = 'full' | 'mark';

interface Props {
  variant?: LogoVariant;
  tone?: LogoTone;
  className?: string;
  /** Rendered as the accessible name. The mark alone still needs one. */
  label?: string;
  /* Drop to the mark alone on narrow screens. The header needs this: the Tamil
   * sign-in label is wider than the English one, and letting the brand shrink
   * instead squeezed its box to 79px while the wordmark kept painting at full
   * width — so it spilled under the language toggle. Hiding the words is honest;
   * squeezing them is not. */
  compact?: boolean;
}

export function MaruthamLogo({
  variant = 'full',
  tone = 'onLight',
  className = '',
  label = 'Marutham AgroLink',
  compact = false,
}: Props) {
  /* The official wordmark colours (per the user): "Marutham" in Marutham pink,
     "AgroLink" in green. These are the brand identity and must be used verbatim
     on every surface. On the dark footer "Marutham" keeps a light pink and
     "AgroLink" a light green so both stay legible. */
  const ink = tone === 'onDark' ? 'text-[#FCC9DD]' : 'text-blossom-ink';
  const sub = tone === 'onDark' ? 'text-leaf-300' : 'text-forest-700';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label={label} role="img">
      <Mark tone={tone} />
      {variant === 'full' ? (
        <span className={`${compact ? 'hidden sm:flex' : 'flex'} flex-col leading-none`}>
          <span className={`font-serif text-xl font-bold tracking-tight ${ink}`} aria-hidden="true">
            Marutham
          </span>
          <span
            className={`text-[0.62rem] font-bold tracking-[0.18em] uppercase ${sub}`}
            aria-hidden="true"
          >
            AgroLink
          </span>
        </span>
      ) : null}
    </span>
  );
}

/* The official MALOGO badge (farmers + hub scene + MA monogram + lotus scales),
 * lives at public/brand/malogo-full.jpg. It has a light ground, so on dark
 * surfaces we frame it in a rounded white tile — that reads as a deliberate
 * badge rather than a pasted-on rectangle. On light surfaces the tile is
 * invisible. Slightly larger than the old mark so the illustration stays legible. */
function Mark({ tone }: { tone: LogoTone }) {
  const tile = tone === 'onDark' ? 'bg-white ring-1 ring-white/25 p-0.5' : '';
  return (
    <span
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tile}`}
    >
      {/* Static brand asset; next/image adds no benefit for a fixed-size mark. */}
      <img
        src="/brand/malogo-full.jpg"
        alt=""
        aria-hidden="true"
        className="h-full w-full rounded-md object-contain"
      />
    </span>
  );
}
