'use client';

import { useReducedMotion } from 'framer-motion';
import { LotusMark } from '@/components/brand/LotusMark';

/* Running-notes ticker — the "live" band under the header.
 *
 * The notes are the platform's real value line: honest value props, category
 * names and the live platform counts passed down from the server. Nothing here
 * is invented activity ("3 farmers joined 2 min ago" would be fake). What scrolls
 * is true today and stays true.
 *
 * The marquee is CSS (see .ma-ticker in globals.css): two identical tracks, the
 * pair translated -50%, so the seam is invisible. It pauses on hover / focus so
 * a note can be read, and under reduced-motion it does not scroll at all — the
 * notes render as a static, wrapped row instead. */

export function LiveTicker({ items }: { items: string[] }) {
  const reduced = useReducedMotion();
  if (items.length === 0) return null;

  const Note = ({ text }: { text: string }) => (
    <span className="flex shrink-0 items-center gap-2.5 px-6">
      <LotusMark petal="#f6c6da" core="#d9a441" className="h-3.5 w-3.5 shrink-0" />
      <span className="text-caption font-medium whitespace-nowrap text-surface/95">{text}</span>
    </span>
  );

  if (reduced) {
    return (
      <div
        className="wash-forest border-y border-forest-500/30"
        role="marquee"
        aria-label="Platform highlights"
      >
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-y-2 px-6 py-2.5 md:px-10">
          {items.map((t) => (
            <Note key={t} text={t} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="ma-ticker wash-forest relative overflow-hidden border-y border-forest-500/30"
      role="marquee"
      aria-label="Platform highlights"
    >
      {/* Edge fades so notes appear/vanish rather than clipping hard. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-forest-900 to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-forest-900 to-transparent" />
      <div className="flex py-2.5">
        {/* Two copies; aria-hidden on the second so the notes are announced once. */}
        <div className="ma-ticker-track">
          {items.map((t) => (
            <Note key={t} text={t} />
          ))}
        </div>
        <div className="ma-ticker-track" aria-hidden="true">
          {items.map((t) => (
            <Note key={`dup-${t}`} text={t} />
          ))}
        </div>
      </div>
    </div>
  );
}
