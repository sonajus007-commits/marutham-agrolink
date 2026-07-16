import { Leaf, ShieldCheck, Truck } from 'lucide-react';
import { PORTAL_REGISTER } from '@/lib/portal';
import type { LandingCopy } from '@/lib/landing';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { ImageSlot } from '@/components/ui/Placeholder';

/* Hero — asymmetric, copy left / image right.
 *
 * No gradient wash and no full-bleed photo behind text: the brief asks to avoid
 * unnecessary gradients, and text over an unknown future photograph is a
 * contrast bug waiting for whichever image lands. The photo sits in its own
 * column where it can be anything and still be legible beside it. */
export function Hero({ c }: { c: LandingCopy }) {
  const icons = [ShieldCheck, Truck, Leaf];

  return (
    <section className="bg-surface px-6 pt-16 pb-[60px] md:px-10 md:pt-24 md:pb-20 lg:pb-[120px]">
      <div className="mx-auto grid w-full max-w-[1440px] items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        {/* min-w-0 is doing real work here. A grid item defaults to min-width:auto,
            so it refuses to shrink below its longest word — and overflow-wrap:
            break-word permits a break WITHOUT reducing min-content width, so it
            alone does not help. Together they let the Tamil hero wrap instead of
            widening the page to 509px. */}
        <div className="flex min-w-0 flex-col gap-7">
          <Reveal kind="fade">
            {/* max-w-full + items-start: an inline-flex pill will not wrap on its
                own, so the Tamil badge (a longer string than the English) grew to
                483px and took the page with it. */}
            <span className="border-border bg-bg text-forest-700 inline-flex max-w-full items-start gap-2 rounded-full border px-4 py-1.5 text-caption font-semibold">
              <Leaf className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {c.hero.badge}
            </span>
          </Reveal>

          <Reveal kind="fade-up" delay={0.05}>
            <h1 className="text-forest-900 text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-[3.25rem] lg:text-hero">
              {c.hero.titleA}
              <br />
              <span className="text-forest-500">{c.hero.titleB}</span>
            </h1>
          </Reveal>

          <Reveal kind="fade-up" delay={0.1}>
            <p className="text-fg-muted max-w-[52ch] text-body">{c.hero.sub}</p>
          </Reveal>

          <Reveal kind="fade-up" delay={0.15}>
            <div className="flex flex-wrap gap-3">
              <Button href="/products" arrow>
                {c.hero.ctaShop}
              </Button>
              <Button href={PORTAL_REGISTER} variant="secondary">
                {c.hero.ctaSell}
              </Button>
            </div>
          </Reveal>

          <Reveal kind="fade-up" delay={0.2}>
            <ul className="text-fg-muted flex list-none flex-wrap gap-x-7 gap-y-2 p-0 text-caption">
              {c.hero.trust.map((label, i) => {
                const Icon = icons[i];
                return (
                  <li key={label} className="flex items-center gap-2">
                    <Icon className="text-forest-500 h-4 w-4 shrink-0" aria-hidden="true" />
                    {label}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal kind="scale" delay={0.1}>
          <ImageSlot
            aspect="aspect-[4/5]"
            slotLabel={c.imageSlot.label}
            description="A Marutham farmer in their field, holding just-harvested produce. Natural light, shot on the farm — not a stock studio image."
          />
        </Reveal>
      </div>
    </section>
  );
}
