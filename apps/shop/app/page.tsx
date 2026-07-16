import { cookies } from 'next/headers';
import { getPublicStats } from '@/lib/api';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
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
  const s = await getPublicStats();

  /* Real counts, straight from GET /config/stats. Small because the platform is
   * young — the reference comp's 2,184 / 18,940 / 25 are illustration, and are
   * not what this renders. */
  const stats: Stat[] = [
    { value: s.activeSellers, label: 'Growers & sellers', hint: 'Active on the platform' },
    { value: s.happyCustomers, label: 'Families buying', hint: 'Active consumers' },
    { value: s.activeDistricts, label: 'Districts', hint: 'Where we operate' },
    { value: s.activeStates, label: 'States', hint: 'And counting' },
  ];

  return (
    <>
      <SiteHeader t={t} lang={lang} />
      <main>
        <Hero />
        <WhyMarutham />
        <PlatformEcosystem />
        <FarmerJourney />
        <ConsumerJourney />
        <BusinessFeatures />
        <MobileApp />
        <PlatformStatistics stats={stats} />
        <Testimonials />
        <Sustainability />
        <MarketplaceFeatures />
        <Pricing />
        <FAQ />
        <LatestUpdates />
        <DownloadApp />
        <Contact />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
