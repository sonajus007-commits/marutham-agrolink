'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';

/* Platform statistics — REAL counts from GET /config/stats.
 *
 * The reference comp shows "2,184+ farmers / 18,940+ customers / 25+ districts".
 * Those are not our numbers and they are not rounded versions of our numbers —
 * they are illustration. What this renders is whatever the API returns, which is
 * currently small because the platform is young. A young number that is true is
 * worth more on a public page than a large one that is not, and the day it does
 * read 2,184 it will do so on its own.
 *
 * The counter animates to the value; it never invents one. */

export interface Stat {
  value: number;
  label: string;
  hint: string;
}

function Counter({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? to : 0);

  useEffect(() => {
    if (!inView || reduced || to === 0) {
      setN(to);
      return;
    }
    const DURATION = 1100;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / DURATION, 1);
      // easeOutExpo — fast, then settles. Reads as counting up, not sliding.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {n.toLocaleString('en-IN')}
    </span>
  );
}

export function PlatformStatistics({ stats }: { stats: Stat[] }) {
  return (
    <Section id="stats" tone="surface" aria-labelledby="stats-h">
      <SectionHeader
        id="stats-h"
        eyebrow="Where we are"
        accent="gold"
        align="center"
        title="Small numbers, honestly reported"
        lede="These are live counts from the platform, not projections. They will grow, and this page will say so when they do."
      />

      <ul className="mt-14 grid list-none grid-cols-2 gap-5 p-0 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal as="li" key={s.label} kind="fade-up" delay={i * 0.07}>
            <div className="border-border bg-surface-raised flex h-full flex-col items-center gap-1 rounded-2xl border px-5 py-9 text-center">
              {/* Display-size numerals: the only place an accent this light is
                  allowed to be type at all. */}
              <span className="text-forest-700 text-[2.75rem] leading-none font-bold">
                <Counter to={s.value} />
              </span>
              <span className="bg-gold-500 my-3 h-1 w-8 rounded-full" aria-hidden="true" />
              <span className="text-forest-900 text-caption font-semibold">{s.label}</span>
              <span className="text-fg-muted text-[0.75rem]">{s.hint}</span>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
