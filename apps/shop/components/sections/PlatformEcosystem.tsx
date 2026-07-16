import { Sprout, ShoppingBasket, Warehouse, BikeIcon, Building2, LineChart } from 'lucide-react';
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

const ROLES = [
  {
    icon: Sprout,
    name: 'Farmers',
    body: 'List produce, set a price, confirm what is available today, and see the payout for every order.',
  },
  {
    icon: ShoppingBasket,
    name: 'Consumers',
    body: 'Browse what is fresh in your district, order, and follow it to your door.',
  },
  {
    icon: Warehouse,
    name: 'Village Collection',
    body: 'Officers collect from farms on a route, weigh what arrives, and hand it to the hub.',
  },
  {
    icon: BikeIcon,
    name: 'Delivery Partners',
    body: 'Take the day’s dispatch, scan each drop, and capture proof of delivery on the spot.',
  },
  {
    icon: Building2,
    name: 'Businesses',
    body: 'Retailers and bulk buyers sell and source on the same rails, on their own fee terms.',
  },
  {
    icon: LineChart,
    name: 'Operations & Leadership',
    body: 'Live dashboards for hubs, districts and the board — built on the same data, not a copy of it.',
  },
];

export function PlatformEcosystem() {
  return (
    <Section id="ecosystem" tone="surface" aria-labelledby="eco-h">
      <SectionHeader
        id="eco-h"
        eyebrow="Platform ecosystem"
        accent="gold"
        title="One platform, six kinds of people"
        lede="Each role has its own surface and its own permissions — and all of them read from a single source of truth."
      />

      <ul className="mt-14 grid list-none grid-cols-1 gap-5 p-0 md:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r, i) => (
          <Reveal as="li" key={r.name} kind="fade-up" delay={i * 0.05}>
            <div className="border-border bg-surface-raised group flex h-full flex-col gap-4 overflow-hidden rounded-2xl border p-7 transition-shadow duration-300 hover:shadow-[0_12px_32px_rgba(22,61,47,0.08)]">
              <span className="text-forest-700 inline-flex">
                <r.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="text-forest-900 text-card font-semibold">{r.name}</h3>
              <p className="text-fg-muted text-caption leading-relaxed">{r.body}</p>
              {/* gold as a FILL — the one safe use for it */}
              <span className="bg-gold-500 mt-auto h-1 w-10 rounded-full transition-all duration-300 group-hover:w-20" />
            </div>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
