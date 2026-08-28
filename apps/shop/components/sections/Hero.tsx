import { Leaf, ShieldCheck, Truck } from 'lucide-react';
import type { Product } from '@marutham/lib';
import { PORTAL_REGISTER } from '@/lib/portal';
import type { Dict } from '@/lib/dict';
import type { LandingCopy } from '@/lib/landing';
import { Button } from '@/components/ui/Button';
import { Reveal } from '@/components/ui/Reveal';
import { FreshPicks } from '@/components/sections/FreshPicks';
import { landscapeBg } from '@/lib/landscapeBg';

/* Hero — the front door, sitting on Marutham, the farmland (the brand's own
 * thinai). Copy left; an informative "fresh today" card right, in place of the
 * old logo medallion — the visitor sees real produce and the value flow at once.
 *
 * Colour comes from FILLS: the bloom-gradient wash and the faint Marutham terrain
 * (paddy furrows + a river) behind everything. Body text stays on the light
 * ground at its audited ink colours; the one accent that is type, the hero's
 * second line, is large-display size — the only place the gradient is allowed. */
export function Hero({ c, t, products }: { c: LandingCopy; t: Dict; products: Product[] }) {
  const icons = [ShieldCheck, Truck, Leaf];
  const trustTints = ['text-blossom-ink', 'text-water-ink', 'text-leaf-ink'];
  /* A farmland photo when one is dropped in; the bloom wash + terrain otherwise. */
  const photo = landscapeBg('marutham');

  return (
    <section
      className={`ground-marutham relative overflow-hidden px-6 pt-16 pb-[60px] md:px-10 md:pt-20 md:pb-20 lg:pb-[110px] ${photo ? '' : 'wash-bloom'}`}
    >
      {photo ? (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url("${photo}")` }}
            aria-hidden="true"
          />
          {/* Horizontal scrim: near-solid on the left where the copy sits,
              lighter on the right where the (solid) card sits. */}
          <div
            className="absolute inset-0"
            style={{
              background:
                'linear-gradient(90deg, rgba(253,242,246,0.97) 0%, rgba(253,242,246,0.86) 46%, rgba(253,242,246,0.60) 100%)',
            }}
            aria-hidden="true"
          />
        </>
      ) : (
        <div className="terrain terrain-marutham" aria-hidden="true" />
      )}
      <span className="thinai-tag" style={{ color: '#ad1457' }} aria-hidden="true">
        மருதம் · Marutham
      </span>

      <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-7">
          <Reveal kind="fade">
            <span className="border-blossom-500/30 bg-surface-raised/80 text-blossom-ink inline-flex max-w-full items-center gap-2 rounded-full border px-4 py-1.5 text-caption font-semibold shadow-[0_2px_12px_rgba(217,92,138,0.12)] backdrop-blur-sm">
              <Leaf className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {c.hero.badge}
            </span>
          </Reveal>

          <Reveal kind="fade-up" delay={0.05}>
            <h1 className="text-forest-900 text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance sm:text-[3.25rem] lg:text-hero">
              {c.hero.titleA}
              <br />
              <span className="text-bloom-gradient">{c.hero.titleB}</span>
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
                    <Icon className={`${trustTints[i]} h-4 w-4 shrink-0`} aria-hidden="true" />
                    {label}
                  </li>
                );
              })}
            </ul>
          </Reveal>
        </div>

        <Reveal kind="scale" delay={0.1}>
          <FreshPicks products={products} t={t} c={c} />
        </Reveal>
      </div>
    </section>
  );
}
