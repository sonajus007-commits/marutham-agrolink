import { HandCoins, Sunrise, Route, ScanLine } from 'lucide-react';
import type { LandingCopy } from '@/lib/landing';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { ACCENT_CHIP, ACCENT_BAR } from '@/components/ui/accents';

/* Why Marutham — soft grey ground, blossom eyebrow, per the brief's table.
 *
 * Every claim maps to something the platform actually does. The farmer really
 * does set `farmer_price`; the platform fee really is added on top of it rather
 * than taken out of it; scans really do drive the delivery pipeline. Nothing
 * here is aspiration written in the present tense. */

const ICONS = [HandCoins, Sunrise, Route, ScanLine];

export function WhyMarutham({ c }: { c: LandingCopy }) {
  return (
    <Section id="why" thinai="mullai" aria-labelledby="why-h">
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
              <div className="border-border bg-surface-raised group flex h-full flex-col gap-3 rounded-2xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(22,61,47,0.12)]">
                <span
                  className={`${ACCENT_CHIP[i % ACCENT_CHIP.length]} inline-flex h-11 w-11 items-center justify-center rounded-xl`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-forest-900 text-card font-semibold">{r.t}</h3>
                <p className="text-fg-muted text-caption leading-relaxed">{r.d}</p>
                <span
                  className={`${ACCENT_BAR[i % ACCENT_BAR.length]} mt-auto h-1 w-8 rounded-full transition-all duration-300 group-hover:w-16`}
                  aria-hidden="true"
                />
              </div>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}
