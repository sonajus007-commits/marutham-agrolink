import { cookies } from 'next/headers';
import { getAvailableProducts } from '@/lib/api';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { Hero } from '@/components/sections/Hero';
import { CategoryRail } from '@/components/sections/CategoryRail';
import { FreshToday } from '@/components/sections/FreshToday';
import { FarmToHome } from '@/components/sections/FarmToHome';
import { FarmerStories } from '@/components/sections/FarmerStories';
import { MeetFarmers } from '@/components/sections/MeetFarmers';

/* The public marketplace homepage — a Server Component.
 *
 * Trimmed to the approved "premium farm-to-home" model: a shopping-first page of
 * Hero → Shop by Category → Fresh Today → From Farm To Your Home → Meet Our
 * Farmers → Footer. Everything a crawler needs arrives as HTML; the only client
 * pieces are the reveals and the cart badge.
 *
 * The earlier long brand tail (Why Marutham, ecosystem, journeys, statistics,
 * testimonials, sustainability, pricing, FAQ, updates, download, contact) is not
 * part of this model and no longer renders here. Those section components still
 * exist under components/sections and can be brought back onto a dedicated page
 * (e.g. /about, /how-it-works) rather than crowding the storefront home. */
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

export default async function HomePage() {
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(cookieLang) ? cookieLang : DEFAULT_LANG;
  const t = DICT[lang];
  const c = LANDING[lang];
  const products = await getAvailableProducts();

  return (
    <>
      <SiteHeader t={t} lang={lang} />
      <main>
        <Hero c={c} lang={lang} />
        <CategoryRail products={products} t={t} />
        <FreshToday products={products} t={t} />
        <FarmToHome lang={lang} />
        <FarmerStories lang={lang} />
        <MeetFarmers products={products} lang={lang} />
      </main>
      <SiteFooter t={t} c={c} />
    </>
  );
}
