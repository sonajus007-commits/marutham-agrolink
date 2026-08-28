import { cookies } from 'next/headers';
import { getPublicStats, getAvailableProducts } from '@/lib/api';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { LiveTicker } from '@/components/sections/LiveTicker';
import { Hero } from '@/components/sections/Hero';
import { WhyMarutham } from '@/components/sections/WhyMarutham';
import { PlatformEcosystem } from '@/components/sections/PlatformEcosystem';
import { FarmerJourney, ConsumerJourney } from '@/components/sections/Journeys';
import { PlatformStatistics, type Stat } from '@/components/sections/PlatformStatistics';
import {
  BusinessFeatures,
  MobileApp,
  Sustainability,
  MarketplaceFeatures,
  FAQ,
  Contact,
} from '@/components/sections/Rest';
import { Testimonials, Pricing, LatestUpdates, DownloadApp } from '@/components/sections/Pending';

/* The public marketplace homepage — a Server Component.
 *
 * Everything a crawler needs arrives as HTML. The only client components are the
 * ones that must touch the browser: the scroll reveals and the stat counters.
 * The sections themselves render on the server, so the copy, the FAQ answers and
 * the live stats are all in the source.
 *
 * Section order follows the brief. Grounds alternate (surface / bg / mist / sand
 * / forest) so no two adjacent sections read as the same slide, and the two
 * journey sections mirror each other's image placement.
 *
 * Four sections — Testimonials, Pricing, Latest Updates, Download App — render
 * an honest "waiting for content" state rather than invented quotes, tiers,
 * posts or links. See components/sections/Pending.tsx for what each needs. */
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

export default async function HomePage() {
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(cookieLang) ? cookieLang : DEFAULT_LANG;
  const t = DICT[lang];
  const c = LANDING[lang];
  const [s, products] = await Promise.all([getPublicStats(), getAvailableProducts()]);

  /* Real counts, straight from GET /config/stats. Small because the platform is
   * young — the reference comp's 2,184 / 18,940 / 25 are illustration, and are
   * not what this renders. */
  const stats: Stat[] = [
    { value: s.activeSellers, label: c.stats.sellers, hint: c.stats.sellersHint },
    { value: s.happyCustomers, label: c.stats.customers, hint: c.stats.customersHint },
    { value: s.activeDistricts, label: c.stats.districts, hint: c.stats.districtsHint },
    { value: s.activeStates, label: c.stats.states, hint: c.stats.statesHint },
  ];

  /* Running-notes for the live ticker. Every note is an already-translated
   * string or a live count folded into one — nothing invented. Live numbers ride
   * at the front so the band leads with something that is literally true right
   * now; the rest are the platform's honest value line and category names. */
  const nf = (n: number) => n.toLocaleString('en-IN');
  const notes: string[] = [
    c.hero.badge,
    `${nf(s.activeSellers)} · ${c.stats.sellers}`,
    c.hero.trust[0],
    `${nf(s.activeDistricts)} · ${c.stats.districts}`,
    c.why.items[0].t,
    c.hero.trust[2],
    c.consumer.steps[2].t,
    c.marketplace.items[0].t,
    c.mobile.items[0].t,
    `${nf(s.happyCustomers)} · ${c.stats.customers}`,
    c.hero.trust[1],
  ];

  return (
    <>
      <SiteHeader t={t} lang={lang} />
      <LiveTicker items={notes} />
      <main>
        <Hero c={c} t={t} products={products} />
        <WhyMarutham c={c} />
        <PlatformEcosystem c={c} />
        <FarmerJourney c={c} />
        <ConsumerJourney c={c} />
        <BusinessFeatures c={c} />
        <MobileApp c={c} />
        <PlatformStatistics
          stats={stats}
          eyebrow={c.stats.eyebrow}
          title={c.stats.title}
          lede={c.stats.lede}
        />
        <Testimonials c={c} />
        <Sustainability c={c} />
        <MarketplaceFeatures c={c} />
        <Pricing c={c} />
        <FAQ c={c} />
        <LatestUpdates c={c} />
        <DownloadApp c={c} />
        <Contact c={c} />
      </main>
      <SiteFooter t={t} c={c} />
    </>
  );
}
