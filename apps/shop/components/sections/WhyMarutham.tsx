import { HandCoins, Sunrise, Route, ScanLine } from 'lucide-react';
import type { LandingCopy } from '@/lib/landing';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';

/* Why Marutham — soft grey ground, blossom eyebrow, per the brief's table.
 *
 * Every claim maps to something the platform actually does. The farmer really
 * does set `farmer_price`; the platform fee really is added on top of it rather
 * than taken out of it; scans really do drive the delivery pipeline. Nothing
 * here is aspiration written in the present tense. */

const ICONS = [HandCoins, Sunrise, Route, ScanLine];

export function WhyMarutham({ c }: { c: LandingCopy }) {
  return (
    <Section id="why" tone="bg" aria-labelledby="why-h">
      <SectionHeader
        id="why-h"
        eyebrow={c.why.eyebrow}
        accent="blossom"
        title={c.why.title}
        lede={c.why.lede}
      />

      <ul className="mt-14 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {c.why.items.map((r, i) => {
          const Icon = ICONS[i];
          return (
            <Reveal as="li" key={r.t} kind="fade-up" delay={i * 0.07}>
              <div className="border-border bg-surface-raised flex h-full flex-col gap-3 rounded-2xl border p-7 transition-shadow duration-300 hover:shadow-[0_12px_32px_rgba(22,61,47,0.08)]">
                <span className="bg-mist text-forest-700 inline-flex h-11 w-11 items-center justify-center rounded-xl">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-forest-900 text-card font-semibold">{r.t}</h3>
                <p className="text-fg-muted text-caption leading-relaxed">{r.d}</p>
              </div>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}
