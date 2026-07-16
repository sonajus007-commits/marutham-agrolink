import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';
import { ImageSlot } from '@/components/ui/Placeholder';
import { Button } from '@/components/ui/Button';
import { PORTAL_REGISTER } from '@/lib/portal';

/* Farmer and Consumer journeys.
 *
 * Deliberately mirrored: the farmer's image sits right, the consumer's left, so
 * two step-list sections in a row do not read as the same slide twice.
 *
 * Both lists are the real pipelines. The farmer's steps are the actual listing
 * lifecycle (list -> approved -> confirm with a cutoff -> collection -> payout);
 * the consumer's are the real order stages the scans advance through. If either
 * flow changes in the product, this copy is wrong and should change with it. */

const FARMER_STEPS = [
  {
    n: '01',
    t: 'List your produce',
    d: 'Add what you have, the quantity, and the price you want for it.',
  },
  { n: '02', t: 'We review it', d: 'A quick check by the team, then it is live in your district.' },
  {
    n: '03',
    t: 'Confirm this morning',
    d: 'Say what is actually available today and set the cutoff. After that, it comes off the shop.',
  },
  { n: '04', t: 'We collect', d: 'A collection officer picks up on their route and weighs it in.' },
  {
    n: '05',
    t: 'You are paid',
    d: 'Your payout is your price times the quantity sold. The fee sits on top, not inside it.',
  },
];

const CONSUMER_STEPS = [
  { n: '01', t: 'See your district', d: 'Only what growers near you have confirmed for today.' },
  {
    n: '02',
    t: 'Order in a minute',
    d: 'Add to the basket and check out. UPI or cash on delivery.',
  },
  {
    n: '03',
    t: 'Follow it live',
    d: 'Collection, hub, dispatch, doorstep — each one scanned as it happens.',
  },
  { n: '04', t: 'Rate the grower', d: 'Your rating goes to the farmer who grew it, by name.' },
];

function Steps({ steps, tone }: { steps: typeof FARMER_STEPS; tone: 'leaf' | 'water' }) {
  /* The rail is a FILL, so it keeps the bright -500. The numerals are text at
   * 18px — under the 18.66px large-text bar unless bold, and not worth relying
   * on that — so they take the ink sibling. */
  const rail = tone === 'leaf' ? 'bg-forest-500' : 'bg-water-500';
  const num = tone === 'leaf' ? 'text-leaf-ink' : 'text-water-ink';
  return (
    <ol className="flex list-none flex-col p-0">
      {steps.map((s, i) => (
        <Reveal as="li" key={s.n} kind="fade-up" delay={i * 0.06}>
          <div className="flex gap-5">
            <div className="flex flex-col items-center">
              {/* text-body/600 keeps these numerals at the large-text bar, which
                  is the only bar water-500 (3.3:1) clears. */}
              <span className={`text-body font-bold tabular-nums ${num}`}>{s.n}</span>
              {i < steps.length - 1 ? (
                <span className={`mt-1 w-px flex-1 opacity-30 ${rail}`} aria-hidden="true" />
              ) : null}
            </div>
            <div className="pb-8">
              <h3 className="text-forest-900 text-card font-semibold">{s.t}</h3>
              <p className="text-fg-muted mt-1 max-w-[46ch] text-caption leading-relaxed">{s.d}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}

export function FarmerJourney() {
  return (
    <Section id="farmers" tone="mist" aria-labelledby="farmer-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div>
          <SectionHeader
            id="farmer-h"
            eyebrow="For farmers"
            accent="leaf"
            title="Five steps from your field to their table"
            lede="No auction, no commission agent, no waiting to find out what you earned."
          />
          <div className="mt-10">
            <Steps steps={FARMER_STEPS} tone="leaf" />
          </div>
          <Button href={PORTAL_REGISTER} arrow>
            Start selling
          </Button>
        </div>
        <Reveal kind="scale">
          <ImageSlot
            aspect="aspect-[3/4]"
            description="A grower checking their listings on a phone at the edge of a field. Hands and produce in focus; the screen need not be readable."
          />
        </Reveal>
      </div>
    </Section>
  );
}

export function ConsumerJourney() {
  return (
    <Section id="consumers" tone="surface" aria-labelledby="consumer-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        {/* image first on desktop, second on mobile — the mirror of the section above */}
        <Reveal kind="scale" className="lg:order-1">
          <ImageSlot
            aspect="aspect-[3/4]"
            description="A family unpacking a delivery at their door — vegetables on a kitchen counter, daylight, unstaged."
          />
        </Reveal>
        <div className="lg:order-2">
          <SectionHeader
            id="consumer-h"
            eyebrow="For consumers"
            accent="water"
            title="Know who grew it, and when"
            lede="Not “fresh” as a slogan. Fresh as a cutoff time you can read on the listing."
          />
          <div className="mt-10">
            <Steps steps={CONSUMER_STEPS} tone="water" />
          </div>
          <Button href="/products" variant="water" arrow>
            Browse produce
          </Button>
        </div>
      </div>
    </Section>
  );
}
