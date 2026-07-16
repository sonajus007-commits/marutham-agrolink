/* ─────────────────────────────────────────────────────────────────────────────
 * PLACEHOLDER — REPLACE THIS FILE WITH THE OFFICIAL LOGO.
 *
 * The real logo is a lotus mark + wordmark that lives outside this repo. This
 * component exists so every surface already imports <MaruthamLogo /> and the
 * swap is one file, not a search-and-replace across the site.
 *
 * To replace: drop the asset in apps/shop/public/brand/ and render it here.
 * Keep the props below — callers rely on them.
 *
 *   <MaruthamLogo />                 header default
 *   <MaruthamLogo variant="mark" />  square mark alone (favicon, app icon, footer)
 *   <MaruthamLogo tone="onDark" />   for the forest-900 footer and CTA bands
 *
 * What this placeholder deliberately does NOT do: invent a logotype. It draws
 * the wordmark in the brand's secondary face — which per the token file is what
 * Cormorant Garamond is FOR ("wordmark only, part of the logo") — plus a neutral
 * mark. Nothing here should be mistaken for the real identity.
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
  const ink = tone === 'onDark' ? 'text-surface' : 'text-forest-700';
  const sub = tone === 'onDark' ? 'text-leaf-300' : 'text-forest-500';

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label={label} role="img">
      <Mark tone={tone} />
      {variant === 'full' ? (
        <span className={`${compact ? 'hidden sm:flex' : 'flex'} flex-col leading-none`}>
          <span className={`font-serif text-xl font-bold tracking-tight ${ink}`} aria-hidden="true">
            Marutham
          </span>
          <span
            className={`text-[0.6rem] font-semibold tracking-[0.18em] uppercase ${sub}`}
            aria-hidden="true"
          >
            AgroLink
          </span>
        </span>
      ) : null}
    </span>
  );
}

/* A neutral placeholder mark — a leaf in a ring. Geometric on purpose: it must
 * not read as a finished logo, and it must not depend on a system font. */
function Mark({ tone }: { tone: LogoTone }) {
  const ring = tone === 'onDark' ? 'var(--color-leaf-300)' : 'var(--color-forest-700)';
  const fill = tone === 'onDark' ? 'var(--color-surface)' : 'var(--color-forest-500)';
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden="true" focusable="false">
      <circle cx="16" cy="16" r="15" fill="none" stroke={ring} strokeWidth="1.5" />
      <path
        d="M16 24c0-5 2.5-9 7-11-0.5 5.5-3 9.5-7 11zM16 24c0-5-2.5-9-7-11 0.5 5.5 3 9.5 7 11z"
        fill={fill}
      />
      <line x1="16" y1="24" x2="16" y2="17" stroke={ring} strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
