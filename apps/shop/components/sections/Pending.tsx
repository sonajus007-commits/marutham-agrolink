import type { LandingCopy } from '@/lib/landing';
import { Section, SectionHeader } from '@/components/ui/Section';
import { ContentPending } from '@/components/ui/Placeholder';
import { Button } from '@/components/ui/Button';

/* ─────────────────────────────────────────────────────────────────────────────
 * The four sections whose content does not exist yet.
 *
 * These are built, styled and in the page — but each one states what it is
 * waiting for instead of showing invented content. That is a deliberate line,
 * and it is the same one HomeTab already drew for the consumer KPI row:
 * "Wallet & Reward Points are a Phase-2 feature and are intentionally not shown
 * as fake numbers."
 *
 * Specifically NOT done, and why:
 *   Testimonials  — would mean writing customer quotes nobody said. Fabricated
 *                   reviews on the public site of a real business.
 *   Pricing       — there is no consumer pricing model. The only subscription
 *                   endpoint is sellersOnly (a seller's plan fee). Inventing
 *                   tiers would be inventing a commercial offer.
 *   Latest Updates— no CMS, no blog, no posts table. Would be fake news items.
 *   Download App  — the Android APK builds and is signed, but it has no
 *                   distribution channel yet: no Play Store listing, no hosted
 *                   download. A button here would point at nothing.
 *
 * Each becomes real by deleting the ContentPending and rendering the source
 * named in its copy.
 * ───────────────────────────────────────────────────────────────────────────── */

export function Testimonials({ c }: { c: LandingCopy }) {
  return (
    <Section id="testimonials" thinai="neithal" aria-labelledby="testi-h">
      <SectionHeader
        id="testi-h"
        eyebrow={c.testimonials.eyebrow}
        accent="blossom"
        align="center"
        title={c.testimonials.title}
        lede={c.testimonials.lede}
      />
      <div className="mt-12">
        <ContentPending title={c.testimonials.pendingT} needs={c.testimonials.pendingD} />
      </div>
    </Section>
  );
}

export function Pricing({ c }: { c: LandingCopy }) {
  return (
    <Section id="pricing" thinai="neithal" aria-labelledby="pricing-h">
      <SectionHeader
        id="pricing-h"
        eyebrow={c.pricing.eyebrow}
        accent="blossom"
        align="center"
        title={c.pricing.title}
        lede={c.pricing.lede}
      />
      <div className="mt-12">
        <ContentPending title={c.pricing.pendingT} needs={c.pricing.pendingD}>
          <div className="mt-6 flex justify-center">
            <Button href="/#contact" variant="secondary">
              {c.pricing.cta}
            </Button>
          </div>
        </ContentPending>
      </div>
    </Section>
  );
}

export function LatestUpdates({ c }: { c: LandingCopy }) {
  return (
    <Section id="updates" thinai="kurinji" aria-labelledby="updates-h">
      <SectionHeader
        id="updates-h"
        eyebrow={c.updates.eyebrow}
        accent="water"
        title={c.updates.title}
        lede={c.updates.lede}
      />
      <div className="mt-12">
        <ContentPending title={c.updates.pendingT} needs={c.updates.pendingD} />
      </div>
    </Section>
  );
}

export function DownloadApp({ c }: { c: LandingCopy }) {
  return (
    <Section id="download" tone="forestDeep" photo="kurinji" aria-labelledby="dl-h">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <SectionHeader
          id="dl-h"
          eyebrow={c.download.eyebrow}
          tone="dark"
          title={c.download.title}
          lede={c.download.lede}
        />
        <ContentPending
          className="border-forest-500/40 bg-forest-700/40"
          title={c.download.pendingT}
          needs={c.download.pendingD}
        />
      </div>
    </Section>
  );
}
