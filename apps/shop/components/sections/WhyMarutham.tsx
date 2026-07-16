import { HandCoins, Sunrise, Route, ScanLine } from 'lucide-react';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';

/* Why Marutham — soft grey ground, blossom eyebrow, per the brief's table.
 *
 * Every claim maps to something the platform actually does. The farmer really
 * does set `farmer_price`; the platform fee really is added on top of it rather
 * than taken out of it; scans really do drive the delivery pipeline. Nothing
 * here is aspiration written in the present tense. */

const REASONS = [
  {
    icon: HandCoins,
    title: 'The farmer sets the price',
    body: 'Growers list their own rate. The platform fee is added on top of what they asked for — it is never taken out of their share.',
  },
  {
    icon: Sunrise,
    title: 'Harvested the same morning',
    body: 'Listings carry a cutoff time. Once it passes, the produce comes off the shop rather than sitting in a warehouse.',
  },
  {
    icon: Route,
    title: 'One short hop',
    body: 'Farm to village collection to hub to your door. Every handover is a person we can name, not a link in an anonymous chain.',
  },
  {
    icon: ScanLine,
    title: 'Tracked, not promised',
    body: 'Each stage is scanned as it happens. The status you see is the state of your order, not an estimate.',
  },
];

export function WhyMarutham() {
  return (
    <Section id="why" tone="bg" aria-labelledby="why-h">
      <SectionHeader
        id="why-h"
        eyebrow="Why Marutham"
        accent="blossom"
        title="Built to move value back to the farm"
        lede="Most of what you pay for food never reaches the person who grew it. This platform exists to change where the money stops."
      />

      <ul className="mt-14 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {REASONS.map((r, i) => (
          <Reveal as="li" key={r.title} kind="fade-up" delay={i * 0.07}>
            <div className="border-border bg-surface-raised flex h-full flex-col gap-3 rounded-2xl border p-7 transition-shadow duration-300 hover:shadow-[0_12px_32px_rgba(22,61,47,0.08)]">
              <span className="bg-mist text-forest-700 inline-flex h-11 w-11 items-center justify-center rounded-xl">
                <r.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="text-forest-900 text-card font-semibold">{r.title}</h3>
              <p className="text-fg-muted text-caption leading-relaxed">{r.body}</p>
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
