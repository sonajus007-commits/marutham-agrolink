import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

/* The button set from the brief: primary (filled), secondary (outline), ghost,
 * and text-with-arrow. Rendered as <a> because every button on a marketing page
 * is a navigation, and a real link is keyboard- and middle-click-correct for
 * free.
 *
 * Contrast, measured, not assumed:
 *   surface on forest-700   9.7:1   ✓ AA at any size
 *   forest-700 on surface   7.8:1   ✓ AA at any size
 * The brief's per-section table also proposes a blue button (Consumer Journey)
 * and a brown one (Business Features). White on water-500 is 3.3:1 — large text
 * only — so `water` keeps its label at 18px/600, which clears the large-text
 * bar. Anything smaller must use `secondary` instead. */

type Variant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'text'
  | 'onDark'
  | 'onDarkOutline'
  | 'blossom'
  | 'water'
  | 'earth';

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold no-underline ' +
  'transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-forest-700 motion-safe:hover:-translate-y-0.5';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-forest-700 text-surface px-7 py-3.5 shadow-[0_2px_10px_rgba(22,61,47,0.18)] hover:bg-forest-900 hover:shadow-[0_8px_24px_rgba(22,61,47,0.24)]',
  secondary:
    'border-2 border-forest-700 text-forest-700 px-7 py-3 hover:bg-forest-700 hover:text-surface',
  ghost: 'text-forest-700 px-5 py-2.5 hover:bg-mist',
  text: 'text-forest-700 px-0 py-1 hover:text-forest-900',
  onDark:
    'bg-surface text-forest-900 px-7 py-3.5 shadow-[0_2px_10px_rgba(0,0,0,0.2)] hover:bg-leaf-300',
  /* White outline for a dark ground (the green hero's secondary CTA). White on
     forest-700/900 is 9.7:1, so both border and label clear AA at any size. */
  onDarkOutline: 'border-2 border-surface/60 text-surface px-7 py-3 hover:bg-surface/12',
  /* The Marutham-pink CTA. blossom-500 is a FILL: white on it is 3.5:1, which
     clears the AA-large bar (3:1) but not the normal one — so, exactly like
     `water`, the label is held at 18px/600 (text-body) and never smaller. */
  blossom: 'bg-blossom-500 text-surface px-7 py-3.5 text-body hover:brightness-105',
  /* 18px/600 keeps this at the AA-large bar white-on-water requires. */
  water: 'bg-water-500 text-surface px-7 py-3.5 text-body hover:brightness-95',
  earth: 'bg-earth-500 text-surface px-7 py-3.5 hover:brightness-95',
};

interface Props {
  href: string;
  children: ReactNode;
  variant?: Variant;
  /** Slides on hover. The brief's "arrow animation". */
  arrow?: boolean;
  className?: string;
}

export function Button({ href, children, variant = 'primary', arrow, className = '' }: Props) {
  return (
    <a href={href} className={`${BASE} ${VARIANT[variant]} ${className} group`}>
      {children}
      {arrow ? (
        <ArrowRight
          className="h-4 w-4 transition-transform duration-200 motion-safe:group-hover:translate-x-1"
          aria-hidden="true"
        />
      ) : null}
    </a>
  );
}
