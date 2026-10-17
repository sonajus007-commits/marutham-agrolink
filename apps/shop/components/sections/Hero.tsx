import { Leaf, ShieldCheck, Truck } from 'lucide-react';
import { PORTAL_REGISTER } from '@/lib/portal';
import type { Product } from '@marutham/lib';
import type { Dict, Lang } from '@/lib/dict';
import type { LandingCopy } from '@/lib/landing';
import { Button } from '@/components/ui/Button';
import { LocaleA } from '@/components/LocaleLink';
import { HeroStories } from '@/components/sections/HeroStories';
import { ProduceBasket } from '@/components/sections/ProduceBasket';
import { recentStories } from '@/lib/farmerStories';

/* Hero — the front door, rebuilt to the approved "premium farm-to-home" model:
 * a bold forest-green panel, white headline with a pink second line, a pink
 * "Shop Fresh" CTA and an outline "Sell" CTA, and the real "Fresh today" card
 * floating white on the green. The earlier Ainthinai pastel wash + terrain +
 * corner tag were retired with the rest of that theme (see components/ui/Section).
 *
 * The headline is NOT wrapped in a scroll reveal: it is the LCP element and the
 * page's whole message, so it must paint immediately, never wait on an observer. */
export function Hero({
  c,
  t,
  lang,
  products,
}: {
  c: LandingCopy;
  t: Dict;
  lang: Lang;
  products: Product[];
}) {
  const icons = [ShieldCheck, Truck, Leaf];
  const hasStories = recentStories(1).length > 0;

  return (
    <section
      className="relative overflow-hidden px-6 pt-8 pb-8 md:px-10 md:pt-20 md:pb-20 lg:pb-28"
      style={{ backgroundColor: '#388004' }}
    >
      {/* Grass-green ground (#388004). A soft light glow top-right and a slightly
          deeper green pool bottom-left add depth and lift the white copy off the
          mid-tone green where the sub-text and trust row sit. Purely decorative. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(45% 55% at 88% 12%, rgba(255,255,255,0.16), transparent 60%),' +
            'radial-gradient(60% 70% at 4% 100%, rgba(18,58,44,0.55), transparent 62%)',
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto grid w-full max-w-[1440px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="flex min-w-0 flex-col gap-5 md:gap-7">
          <span className="hidden max-w-full items-center gap-2 self-start rounded-full sm:inline-flex border border-white/20 bg-white/10 px-4 py-1.5 text-caption font-semibold text-white backdrop-blur-sm">
            <Leaf className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {c.hero.badge}
          </span>

          <h1 className="text-hero font-bold tracking-tight text-balance text-white">
            {c.hero.titleA}
            <br />
            <span className="text-[#FCC9DD]">{c.hero.titleB}</span>
          </h1>

          <p className="max-w-[52ch] text-body text-white/85">{c.hero.sub}</p>

          <div className="flex flex-wrap gap-3">
            <Button href="/products" variant="blossom" arrow>
              {c.hero.ctaShop}
            </Button>
            {/* Two pill buttons don't fit one row on a phone, and stacked they
                pushed the shop below the fold — so on mobile "Sell" drops to a
                text link and shopping keeps the only button. */}
            <span className="hidden sm:contents">
              <Button href={PORTAL_REGISTER} variant="onDarkOutline">
                {c.hero.ctaSell}
              </Button>
            </span>
            <LocaleA
              href={PORTAL_REGISTER}
              className="inline-flex min-h-11 items-center text-caption font-semibold text-white underline underline-offset-4 sm:hidden"
            >
              {c.hero.ctaSell} →
            </LocaleA>
          </div>

          <ul className="flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-caption text-white/80 md:gap-x-7">
            {c.hero.trust.map((label, i) => {
              const Icon = icons[i];
              return (
                <li key={label} className="flex items-center gap-2">
                  <Icon className="text-leaf-300 h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Recent farmer stories, auto-scrolling — or, while the sample stories
            are switched off pre-launch, the basket of real produce photos with a
            live price. Not wrapped in a scroll reveal: it is above the fold and
            part of the hero. Desktop only — below lg the grid is one column and
            this card sat between the shopper and the produce. */}
        <div className="hidden min-w-0 lg:block">
          {hasStories ? <HeroStories lang={lang} /> : <ProduceBasket products={products} t={t} />}
        </div>
      </div>
    </section>
  );
}
