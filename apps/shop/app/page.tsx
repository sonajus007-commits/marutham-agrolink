import { cookies } from 'next/headers';
import { getPublicStats } from '@/lib/api';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
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
  const s = await getPublicStats();

  /* Real counts, straight from GET /config/stats. Small because the platform is
   * young — the reference comp's 2,184 / 18,940 / 25 are illustration, and are
   * not what this renders. */
  const stats: Stat[] = [
    { value: s.activeSellers, label: c.stats.sellers, hint: c.stats.sellersHint },
    { value: s.happyCustomers, label: c.stats.customers, hint: c.stats.customersHint },
    { value: s.activeDistricts, label: c.stats.districts, hint: c.stats.districtsHint },
    { value: s.activeStates, label: c.stats.states, hint: c.stats.statesHint },
  ];

  return (
    <>
      <SiteHeader t={t} lang={lang} />
      <main>
        <Hero c={c} />
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
