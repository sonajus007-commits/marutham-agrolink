import type { ReactNode } from 'react';
import { Reveal } from './Reveal';
import { landscapeBg } from '@/lib/landscapeBg';

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

/* The five Sangam landscapes. When a section names one, it sets that ground, lays
 * the terrain line-art behind the content, and prints the thinai's name in the
 * corner. Grounds + terrain classes live in globals.css; the tag copy is here.
 * `ink` is the corner label's colour — all clear AA on their (light) ground. */
export type Thinai = 'marutham' | 'mullai' | 'neithal' | 'kurinji' | 'palai';

/* The retired landscapes now map to plain commercial ground tones, alternating
 * clean white / pale-green / warm-sand so adjacent sections still read as
 * distinct slides without any pastel wash. */
const THINAI_TONE: Record<Thinai, SectionTone> = {
  marutham: 'surface',
  mullai: 'mist',
  neithal: 'surface',
  kurinji: 'bg',
  palai: 'sand',
};

interface SectionProps {
  id?: string;
  tone?: SectionTone;
  children: ReactNode;
  className?: string;
  /** Sit this section on one of the five Ainthinai landscapes. Overrides `tone`. */
  thinai?: Thinai;
  /* On a DARK-tone band (forest / forestDeep), optionally lay a landscape photo
   * behind the white text under a DARK scrim. Reuses the same public/landscapes
   * files as the light thinai sections; with no file the band stays solid forest.
   * Ignored when `thinai` is set (that path owns the background). */
  photo?: Thinai;
  'aria-labelledby'?: string;
}

const DARK_TONES: SectionTone[] = ['forest', 'forestDeep'];

export function Section({
  id,
  tone = 'surface',
  children,
  className = '',
  thinai,
  photo,
  ...rest
}: SectionProps) {
  /* Ainthinai landscape theme retired from the public marketplace (2026-08) — the
   * homepage converges on the clean "premium farm-to-home" commerce look. A
   * `thinai` now just maps to a plain ground tone; the pastel wash, terrain art
   * and corner tag are no longer drawn. The prop stays accepted so the ~13
   * section call-sites need not all change at once. */
  const ground = TONE[thinai ? THINAI_TONE[thinai] : tone];
  /* Dark-band photo: only on a dark tone, only when a file exists. */
  const darkPhoto = !thinai && photo && DARK_TONES.includes(tone) ? landscapeBg(photo) : null;
  return (
    <section
      id={id}
      className={`${ground} relative overflow-hidden px-6 py-[60px] md:px-10 md:py-20 lg:py-[120px] ${className}`}
      aria-labelledby={rest['aria-labelledby']}
    >
      {darkPhoto ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${darkPhoto}")` }}
            aria-hidden="true"
          />
          {/* Dark scrim keeps white text at full contrast over any photo. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(180deg, rgba(22,61,47,0.86) 0%, rgba(22,61,47,0.92) 100%)',
            }}
            aria-hidden="true"
          />
        </>
      ) : null}
      <div className="relative mx-auto w-full max-w-[1440px]">{children}</div>
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
  /* No items-start / items-center here, deliberately.
   *
   * This is a flex COLUMN, so align-items works on the horizontal axis: both
   * `items-start` and `items-center` size each child to its own max-content
   * instead of stretching it to the container. With English that is invisible —
   * max-content fits. With Tamil the h2's unbroken compound is 388px inside a
   * 342px column, so the heading overflowed and dragged a horizontal scrollbar
   * onto the whole page. min-w-0 and overflow-wrap cannot help: the child is not
   * being asked to shrink, it is being sized to its content.
   *
   * The default (stretch) gives every child the full column width, and text-align
   * then does the actual aligning — which is what was wanted in the first place. */
  const alignment = align === 'center' ? 'mx-auto text-center' : '';
  /* The eyebrow is small text, so on light grounds it must use an ink-safe
   * accent. `gold` maps to earth above for exactly that reason. On dark grounds
   * leaf-300 clears AA comfortably. */
  const eyebrowTone = tone === 'dark' ? 'text-leaf-300' : EYEBROW_ACCENT[accent];
  const titleTone = tone === 'dark' ? 'text-surface' : 'text-forest-900';
  const ledeTone = tone === 'dark' ? 'text-leaf-300' : 'text-fg-muted';

  /* min-w-0 on each child is load-bearing, not defensive. This Reveal is a flex
   * column, so its children are flex items and default to min-width:auto —
   * they will not shrink below their longest word. English words are short
   * enough that this never showed; Tamil compounds are not
   * ("மண்ணிலிருந்து சமையலறைக்கு" measures 388px at section size), and the h2
   * widened the page instead of wrapping. overflow-wrap alone cannot fix it:
   * break-word permits a break but does NOT reduce min-content width. */
  return (
    <Reveal className={`flex max-w-[60ch] flex-col gap-4 ${alignment}`}>
      {eyebrow ? (
        <span
          className={`min-w-0 text-[0.7rem] font-semibold tracking-[0.16em] uppercase ${eyebrowTone}`}
        >
          {eyebrow}
        </span>
      ) : null}
      <h2
        id={id}
        className={`text-section min-w-0 font-bold tracking-tight text-balance ${titleTone}`}
      >
        {title}
      </h2>
      {lede ? <p className={`text-body min-w-0 ${ledeTone}`}>{lede}</p> : null}
    </Reveal>
  );
}
