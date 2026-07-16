import type { LandingCopy } from '@/lib/landing';
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
 * flow changes in the product, this copy is wrong and should change with it.
 *
 * The step numbers are generated, not authored — they are ordinals, so they
 * never needed translating and cannot drift out of sync with the list. */

function Steps({ steps, tone }: { steps: { t: string; d: string }[]; tone: 'leaf' | 'water' }) {
  /* The rail is a FILL, so it keeps the bright -500. The numerals are text at
   * 18px — under the 18.66px large-text bar unless bold, and not worth relying
   * on that — so they take the ink sibling. */
  const rail = tone === 'leaf' ? 'bg-forest-500' : 'bg-water-500';
  const num = tone === 'leaf' ? 'text-leaf-ink' : 'text-water-ink';
  return (
    <ol className="flex list-none flex-col p-0">
      {steps.map((s, i) => (
        <Reveal as="li" key={s.t} kind="fade-up" delay={i * 0.06}>
          <div className="flex gap-5">
            <div className="flex flex-col items-center">
              <span className={`text-body font-bold tabular-nums ${num}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
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

export function FarmerJourney({ c }: { c: LandingCopy }) {
  return (
    <Section id="farmers" tone="mist" aria-labelledby="farmer-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        <div className="min-w-0">
          <SectionHeader
            id="farmer-h"
            eyebrow={c.farmer.eyebrow}
            accent="leaf"
            title={c.farmer.title}
            lede={c.farmer.lede}
          />
          <div className="mt-10">
            <Steps steps={c.farmer.steps} tone="leaf" />
          </div>
          <Button href={PORTAL_REGISTER} arrow>
            {c.farmer.cta}
          </Button>
        </div>
        <Reveal kind="scale">
          <ImageSlot
            aspect="aspect-[3/4]"
            slotLabel={c.imageSlot.label}
            description="A grower checking their listings on a phone at the edge of a field. Hands and produce in focus; the screen need not be readable."
          />
        </Reveal>
      </div>
    </Section>
  );
}

export function ConsumerJourney({ c }: { c: LandingCopy }) {
  return (
    <Section id="consumers" tone="surface" aria-labelledby="consumer-h">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
        {/* image first on desktop, second on mobile — the mirror of the section above */}
        <Reveal kind="scale" className="lg:order-1">
          <ImageSlot
            aspect="aspect-[3/4]"
            slotLabel={c.imageSlot.label}
            description="A family unpacking a delivery at their door — vegetables on a kitchen counter, daylight, unstaged."
          />
        </Reveal>
        <div className="min-w-0 lg:order-2">
          <SectionHeader
            id="consumer-h"
            eyebrow={c.consumer.eyebrow}
            accent="water"
            title={c.consumer.title}
            lede={c.consumer.lede}
          />
          <div className="mt-10">
            <Steps steps={c.consumer.steps} tone="water" />
          </div>
          <Button href="/products" variant="water" arrow>
            {c.consumer.cta}
          </Button>
        </div>
      </div>
    </Section>
  );
}
