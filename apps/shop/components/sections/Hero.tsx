import { Leaf, ShieldCheck, Truck } from 'lucide-react';
import { PORTAL_REGISTER } from '@/lib/portal';
import type { Lang } from '@/lib/dict';
import type { LandingCopy } from '@/lib/landing';
import { Button } from '@/components/ui/Button';
import { HeroStories } from '@/components/sections/HeroStories';

/* Hero — the front door, rebuilt to the approved "premium farm-to-home" model:
 * a bold forest-green panel, white headline with a pink second line, a pink
 * "Shop Fresh" CTA and an outline "Sell" CTA, and the real "Fresh today" card
 * floating white on the green. The earlier Ainthinai pastel wash + terrain +
 * corner tag were retired with the rest of that theme (see components/ui/Section).
 *
 * The headline is NOT wrapped in a scroll reveal: it is the LCP element and the
 * page's whole message, so it must paint immediately, never wait on an observer. */
export function Hero({ c, lang }: { c: LandingCopy; lang: Lang }) {
  const icons = [ShieldCheck, Truck, Leaf];

  return (
    <section
      className="relative overflow-hidden px-6 pt-16 pb-20 md:px-10 md:pt-20 lg:pb-28"
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
        <div className="flex min-w-0 flex-col gap-7">
          <span className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-caption font-semibold text-white backdrop-blur-sm">
            <Leaf className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {c.hero.badge}
          </span>

          <h1 className="text-[2.5rem] leading-[1.05] font-bold tracking-tight text-balance text-white sm:text-[3.25rem] lg:text-hero">
            {c.hero.titleA}
            <br />
            <span className="text-[#FCC9DD]">{c.hero.titleB}</span>
          </h1>

          <p className="max-w-[52ch] text-body text-white/85">{c.hero.sub}</p>

          <div className="flex flex-wrap gap-3">
            <Button href="/products" variant="blossom" arrow>
              {c.hero.ctaShop}
            </Button>
            <Button href={PORTAL_REGISTER} variant="onDarkOutline">
              {c.hero.ctaSell}
            </Button>
          </div>

          <ul className="flex list-none flex-wrap gap-x-7 gap-y-2 p-0 text-caption text-white/80">
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

        {/* Recent farmer stories, auto-scrolling. Always visible (not wrapped in
            a scroll reveal: it is above the fold and part of the hero). */}
        <HeroStories lang={lang} />
      </div>
    </section>
  );
}
