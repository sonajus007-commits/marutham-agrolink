import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { ACCENT_BAR } from '@/components/ui/accents';
import { StatCounter } from '@/components/sections/StatCounter';

/* Platform statistics — REAL counts from GET /config/stats.
 *
 * The reference comp shows "2,184+ farmers / 18,940+ customers / 25+ districts".
 * Those are not our numbers and they are not rounded versions of our numbers —
 * they are illustration. What this renders is whatever the API returns, which is
 * currently small because the platform is young. A young number that is true is
 * worth more on a public page than a large one that is not, and the day it does
 * read 2,184 it will do so on its own.
 *
 * This is a Server Component (its Section reads the filesystem for the landscape
 * photo). The count-up is the one client island — see StatCounter. */

export interface Stat {
  value: number;
  label: string;
  hint: string;
}

export function PlatformStatistics({
  stats,
  eyebrow,
  title,
  lede,
}: {
  stats: Stat[];
  eyebrow: string;
  title: string;
  lede: string;
}) {
  return (
    <Section id="stats" thinai="kurinji" aria-labelledby="stats-h">
      <SectionHeader
        id="stats-h"
        eyebrow={eyebrow}
        accent="gold"
        align="center"
        title={title}
        lede={lede}
      />

      <ul className="mt-14 grid list-none grid-cols-2 gap-5 p-0 lg:grid-cols-4">
        {stats.map((s, i) => (
          <Reveal as="li" key={s.label} kind="fade-up" delay={i * 0.07}>
            <div className="border-border bg-surface-raised flex h-full flex-col items-center gap-1 rounded-2xl border px-5 py-9 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(22,61,47,0.12)]">
              {/* Display-size numerals: the only place an accent this light is
                  allowed to be type at all. */}
              <span className="text-forest-700 text-[2.75rem] leading-none font-bold">
                <StatCounter to={s.value} />
              </span>
              {/* A colour per tile — raw -500 accents used as a FILL only. */}
              <span
                className={`${ACCENT_BAR[i % ACCENT_BAR.length]} my-3 h-1 w-8 rounded-full`}
                aria-hidden="true"
              />
              <span className="text-forest-900 text-caption font-semibold">{s.label}</span>
              <span className="text-fg-muted text-[0.75rem]">{s.hint}</span>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
