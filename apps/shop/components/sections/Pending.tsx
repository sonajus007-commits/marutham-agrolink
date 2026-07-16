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
 * named in its `needs` line.
 * ───────────────────────────────────────────────────────────────────────────── */

export function Testimonials() {
  return (
    <Section id="testimonials" tone="bg" aria-labelledby="testi-h">
      <SectionHeader
        id="testi-h"
        eyebrow="Testimonials"
        accent="blossom"
        align="center"
        title="What growers and families say"
        lede="Real names, real districts, with permission — once we have collected them."
      />
      <div className="mt-12">
        <ContentPending
          title="No testimonials yet"
          needs="This section stays empty until real customers and growers have given quotes we are allowed to publish. Writing placeholder testimonials would mean inventing people, so we have not."
        />
      </div>
    </Section>
  );
}

export function Pricing() {
  return (
    <Section id="pricing" tone="bg" aria-labelledby="pricing-h">
      <SectionHeader
        id="pricing-h"
        eyebrow="Pricing"
        accent="blossom"
        align="center"
        title="What it costs"
        lede="Buying is free. Selling carries a platform fee that sits on top of the farmer’s price, never inside it."
      />
      <div className="mt-12">
        <ContentPending
          title="Seller plans are not published yet"
          needs="The fee a seller pays depends on their seller type, and the subscription plans live behind the portal today. Once the public plan structure is agreed, it belongs here — as the real numbers, not example tiers."
        >
          <div className="mt-6 flex justify-center">
            <Button href="/#contact" variant="secondary">
              Ask us about selling
            </Button>
          </div>
        </ContentPending>
      </div>
    </Section>
  );
}

export function LatestUpdates() {
  return (
    <Section id="updates" tone="sky" aria-labelledby="updates-h">
      <SectionHeader
        id="updates-h"
        eyebrow="Latest updates"
        accent="water"
        title="News from the platform"
        lede="Harvest notes, new districts, and what we shipped."
      />
      <div className="mt-12">
        <ContentPending
          title="Nothing published yet"
          needs="There is no posts source behind this section — no CMS and no blog. It fills the day there is one. Until then it stays empty rather than showing sample articles."
        />
      </div>
    </Section>
  );
}

export function DownloadApp() {
  return (
    <Section id="download" tone="forestDeep" aria-labelledby="dl-h">
      <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <SectionHeader
          id="dl-h"
          eyebrow="Mobile"
          tone="dark"
          title="The app is being tested"
          lede="The Android build is signed and running. It is not on the Play Store yet, so there is nothing honest to link to — you can install the site as an app in the meantime."
        />
        <ContentPending
          className="border-forest-500/40 bg-forest-700/40"
          title="No store listing yet"
          needs="The APK builds and passes signature verification, but it has no distribution channel. A download button would point at nothing, so this waits for a Play Store listing or a hosted release."
        />
      </div>
    </Section>
  );
}
