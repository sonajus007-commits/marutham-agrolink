import { Sprout, ShoppingBasket, Warehouse, BikeIcon, Building2, LineChart } from 'lucide-react';
import type { LandingCopy } from '@/lib/landing';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';

/* Platform Ecosystem — the six roles that actually exist in the product.
 *
 * These are not personas invented for a marketing page: each one is a real role
 * with its own signed-in surface. Farmer, consumer and field agent are routes in
 * the portal; hub and operations are admin consoles; "business" is the Retailer
 * seller_type, which carries a different platform fee from Farmer.
 *
 * Gold is the brief's accent for this section. Gold is 2.19:1 on white so it
 * cannot be ink — it is used here as a FILL on the rule beneath each card. */

const ICONS = [Sprout, ShoppingBasket, Warehouse, BikeIcon, Building2, LineChart];

export function PlatformEcosystem({ c }: { c: LandingCopy }) {
  return (
    <Section id="ecosystem" tone="surface" aria-labelledby="eco-h">
      <SectionHeader
        id="eco-h"
        eyebrow={c.eco.eyebrow}
        accent="gold"
        title={c.eco.title}
        lede={c.eco.lede}
      />

      <ul className="mt-14 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-3">
        {c.eco.items.map((r, i) => {
          const Icon = ICONS[i];
          return (
            <Reveal as="li" key={r.t} kind="fade-up" delay={i * 0.05}>
              <div className="border-border bg-surface-raised group flex h-full flex-col gap-4 overflow-hidden rounded-2xl border p-7 transition-shadow duration-300 hover:shadow-[0_12px_32px_rgba(22,61,47,0.08)]">
                <span className="text-forest-700 inline-flex">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="text-forest-900 text-card font-semibold">{r.t}</h3>
                <p className="text-fg-muted text-caption leading-relaxed">{r.d}</p>
                {/* gold as a FILL — the one safe use for it */}
                <span className="bg-gold-500 mt-auto h-1 w-10 rounded-full transition-all duration-300 group-hover:w-20" />
              </div>
            </Reveal>
          );
        })}
      </ul>
    </Section>
  );
}
