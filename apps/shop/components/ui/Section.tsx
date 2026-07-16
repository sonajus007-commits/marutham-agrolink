import type { ReactNode } from 'react';
import { Reveal } from './Reveal';

/* Section shell — the brief's spacing rules in one place.
 *
 *   max width  1440px
 *   padding    120 desktop / 80 tablet / 60 mobile
 *
 * Every section on the page goes through this, so "breathing space" is a
 * property of the system rather than of whoever wrote the section last. The
 * `tone` prop is the brief's per-section ground colour, named rather than
 * spelled, so the palette stays swappable from globals.css. */

export type SectionTone = 'surface' | 'bg' | 'mist' | 'sand' | 'sky' | 'forest' | 'forestDeep';

const TONE: Record<SectionTone, string> = {
  surface: 'bg-surface text-fg',
  bg: 'bg-bg text-fg',
  mist: 'bg-mist text-fg',
  sand: 'bg-sand text-fg',
  sky: 'bg-sky-tint text-fg',
  forest: 'bg-forest-700 text-surface',
  forestDeep: 'bg-forest-900 text-surface',
};

interface SectionProps {
  id?: string;
  tone?: SectionTone;
  children: ReactNode;
  className?: string;
  'aria-labelledby'?: string;
}

export function Section({ id, tone = 'surface', children, className = '', ...rest }: SectionProps) {
  return (
    <section
      id={id}
      className={`${TONE[tone]} px-6 py-[60px] md:px-10 md:py-20 lg:py-[120px] ${className}`}
      aria-labelledby={rest['aria-labelledby']}
    >
      <div className="mx-auto w-full max-w-[1440px]">{children}</div>
    </section>
  );
}

interface HeaderProps {
  /** The small line above the title. Says what the section IS. */
  eyebrow?: string;
  title: string;
  /** One or two sentences. Short paragraphs, per the content rules. */
  lede?: string;
  id?: string;
  tone?: 'light' | 'dark';
  align?: 'left' | 'center';
  /** Which accent tints the eyebrow. Fills and large text only — never body. */
  accent?: 'forest' | 'blossom' | 'gold' | 'water' | 'earth' | 'leaf';
}

/* An eyebrow is ~11px — small text, so every entry here must be an INK colour.
 * The -500 accents are fills: blossom-500 measures 3.37:1 and forest-500 3.68:1
 * at this size, both failing AA. Each accent therefore maps to its ink sibling,
 * and gold — which cannot be text at any size (2.19:1) — borrows earth, which
 * carries the same warmth at 5.43:1. The section keeps its identity; the type
 * stays readable. */
const EYEBROW_ACCENT: Record<NonNullable<HeaderProps['accent']>, string> = {
  forest: 'text-forest-700',
  blossom: 'text-blossom-ink',
  gold: 'text-earth-500',
  water: 'text-water-ink',
  earth: 'text-earth-500',
  leaf: 'text-leaf-ink',
};

export function SectionHeader({
  eyebrow,
  title,
  lede,
  id,
  tone = 'light',
  align = 'left',
  accent = 'forest',
}: HeaderProps) {
  const alignment = align === 'center' ? 'mx-auto text-center items-center' : 'items-start';
  /* The eyebrow is small text, so on light grounds it must use an ink-safe
   * accent. `gold` maps to earth above for exactly that reason. On dark grounds
   * leaf-300 clears AA comfortably. */
  const eyebrowTone = tone === 'dark' ? 'text-leaf-300' : EYEBROW_ACCENT[accent];
  const titleTone = tone === 'dark' ? 'text-surface' : 'text-forest-900';
  const ledeTone = tone === 'dark' ? 'text-leaf-300' : 'text-fg-muted';

  return (
    <Reveal className={`flex max-w-[60ch] flex-col gap-4 ${alignment}`}>
      {eyebrow ? (
        <span className={`text-[0.7rem] font-semibold tracking-[0.16em] uppercase ${eyebrowTone}`}>
          {eyebrow}
        </span>
      ) : null}
      <h2 id={id} className={`text-section font-bold tracking-tight text-balance ${titleTone}`}>
        {title}
      </h2>
      {lede ? <p className={`text-body ${ledeTone}`}>{lede}</p> : null}
    </Reveal>
  );
}
