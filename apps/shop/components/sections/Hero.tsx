import { Leaf, ShieldCheck, Truck } from 'lucide-react';
import { PORTAL_REGISTER } from '@/lib/portal';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { ImageSlot } from '@/components/ui/Placeholder';

/* Hero — asymmetric, copy left / image right.
 *
 * No gradient wash and no full-bleed photo behind text: the brief asks to avoid
 * unnecessary gradients, and text over an unknown future photograph is a
 * contrast bug waiting for whichever image lands. The photo sits in its own
 * column where it can be anything and still be legible beside it. */
export function Hero() {
  return (
    <section className="bg-surface px-6 pt-16 pb-[60px] md:px-10 md:pt-24 md:pb-20 lg:pb-[120px]">
      <div className="mx-auto grid w-full max-w-[1440px] items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-20">
        <div className="flex flex-col gap-7">
          <Reveal kind="fade">
            <span className="border-border bg-bg text-forest-700 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-caption font-semibold">
              <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
              Farm to home, across Tamil Nadu
            </span>
          </Reveal>

          <Reveal kind="fade-up" delay={0.05}>
            <h1 className="text-forest-900 text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-[3.25rem] lg:text-hero">
              Fresh from the farmer.
              <br />
              <span className="text-forest-500">Direct to your door.</span>
            </h1>
          </Reveal>

          <Reveal kind="fade-up" delay={0.1}>
            <p className="text-fg-muted max-w-[52ch] text-body">
              The farmer names their price. You buy the same day it is harvested. Nothing in
              between, and every step is tracked.
            </p>
          </Reveal>

          <Reveal kind="fade-up" delay={0.15}>
            <div className="flex flex-wrap gap-3">
              <Button href="/products" arrow>
                Browse today&rsquo;s produce
              </Button>
              <Button href={PORTAL_REGISTER} variant="secondary">
                Sell with us
              </Button>
            </div>
          </Reveal>

          <Reveal kind="fade-up" delay={0.2}>
            <ul className="text-fg-muted flex list-none flex-wrap gap-x-7 gap-y-2 p-0 text-caption">
              <li className="flex items-center gap-2">
                <ShieldCheck className="text-forest-500 h-4 w-4" aria-hidden="true" />
                No middlemen
              </li>
              <li className="flex items-center gap-2">
                <Truck className="text-forest-500 h-4 w-4" aria-hidden="true" />
                Scanned at every stage
              </li>
              <li className="flex items-center gap-2">
                <Leaf className="text-forest-500 h-4 w-4" aria-hidden="true" />
                Same-morning harvest
              </li>
            </ul>
          </Reveal>
        </div>

        <Reveal kind="scale" delay={0.1}>
          <ImageSlot
            aspect="aspect-[4/5]"
            description="A Marutham farmer in their field, holding just-harvested produce. Natural light, shot on the farm — not a stock studio image."
          />
        </Reveal>
      </div>
    </section>
  );
}
