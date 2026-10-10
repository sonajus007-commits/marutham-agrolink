import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { langAlternates, localePath, ogLocale } from '@/lib/locale';
import { OG_IMAGE, absoluteUrl } from '@/lib/site';
import { getAvailableProducts } from '@/lib/api';
import { DICT } from '@/lib/dict';
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
/* The home page's own title and description, per language. The layout's are
 * English-only defaults; without these the Tamil home (/ta) told Google it was
 * an English page, and the home had no canonical link at all. */
const HOME_META = {
  en: {
    title: 'Marutham AgroLink — Fresh from Tamil Nadu farms, straight to your home',
    description:
      'Buy fruit and vegetables direct from farmers in Pudukkottai and across Tamil Nadu. ' +
      'Fair prices for farmers, fresh produce for families.',
  },
  ta: {
    title: 'மருதம் அக்ரோலிங்க் — தமிழ்நாட்டுப் பண்ணைகளிலிருந்து நேரடியாக உங்கள் வீட்டிற்கு',
    description:
      'புதுக்கோட்டை மற்றும் தமிழ்நாடு முழுவதும் உள்ள விவசாயிகளிடமிருந்து நேரடியாகக் காய்கறிகள், ' +
      'பழங்களை வாங்குங்கள். விவசாயிகளுக்கு நியாயமான விலை, குடும்பங்களுக்குப் புதிய உணவு.',
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  const m = HOME_META[lang];
  return {
    title: m.title,
    description: m.description,
    alternates: langAlternates('/', lang),
    openGraph: {
      images: [OG_IMAGE],
      title: m.title,
      description: m.description,
      type: 'website',
      url: absoluteUrl(localePath(lang, '/')),
      locale: ogLocale(lang),
    },
  };
}

// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

export default async function HomePage() {
  const lang = await getLang();
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
