import type { Metadata } from 'next';
import Link from 'next/link';
import { getLang } from '@/lib/lang';
import { absoluteUrl } from '@/lib/site';
import type { Lang } from '@/lib/dict';
import { StaticShell, StaticSection } from '@/components/StaticShell';

export const revalidate = 3600;

const C: Record<Lang, ReturnType<typeof en>> = { en: en(), ta: ta() };

function en() {
  return {
    meta: 'Contact — Marutham AgroLink',
    eyebrow: 'Contact',
    title: 'Get in touch',
    lede: 'Marutham Agrolink Private Limited serves Pudukkottai and across Tamil Nadu.',
    areaH: 'Service area',
    area: 'Pudukkottai, Tamil Nadu, India — expanding district by district.',
    reachH: 'Reach us',
    // Honest placeholder: no phone/email is invented here. Fill these in once the
    // company's real support channels are live.
    reach:
      'Phone and email support are being set up — the details will appear here. In the meantime, you can browse the marketplace and sign in to place an order.',
    farmersH: 'Are you a farmer?',
    farmers: 'If you grow near Pudukkottai and want to sell directly, start with',
    farmersCta: 'How it works',
    shopCta: 'Browse the marketplace →',
  };
}

function ta(): ReturnType<typeof en> {
  return {
    meta: 'தொடர்பு — மருதம் அக்ரோலிங்க்',
    eyebrow: 'தொடர்பு',
    title: 'எங்களைத் தொடர்பு கொள்ளுங்கள்',
    lede: 'மருதம் அக்ரோலிங்க் பிரைவேட் லிமிடெட் புதுக்கோட்டை மற்றும் தமிழ்நாடு முழுவதும் சேவை செய்கிறது.',
    areaH: 'சேவை பகுதி',
    area: 'புதுக்கோட்டை, தமிழ்நாடு, இந்தியா — மாவட்டம் மாவட்டமாக விரிவடைகிறது.',
    reachH: 'எங்களை அணுகுங்கள்',
    reach:
      'தொலைபேசி மற்றும் மின்னஞ்சல் ஆதரவு அமைக்கப்படுகிறது — விவரங்கள் இங்கே தோன்றும். அதுவரை, சந்தையைப் பார்த்து உள்நுழைந்து ஆர்டர் செய்யலாம்.',
    farmersH: 'நீங்கள் ஒரு விவசாயியா?',
    farmers:
      'புதுக்கோட்டை அருகில் விளைவித்து நேரடியாக விற்க விரும்பினால், இதிலிருந்து தொடங்குங்கள்',
    farmersCta: 'எப்படி வேலை செய்கிறது',
    shopCta: 'சந்தையைப் பாருங்கள் →',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = C[await getLang()];
  return {
    title: c.meta,
    description: c.lede,
    alternates: { canonical: '/contact' },
    openGraph: {
      title: c.meta,
      description: c.lede,
      type: 'website',
      url: absoluteUrl('/contact'),
    },
  };
}

export default async function ContactPage() {
  const lang = await getLang();
  const c = C[lang];
  return (
    <StaticShell lang={lang} eyebrow={c.eyebrow} title={c.title} lede={c.lede}>
      <StaticSection heading={c.areaH}>
        <p>{c.area}</p>
      </StaticSection>
      <StaticSection heading={c.reachH}>
        <p>{c.reach}</p>
      </StaticSection>
      <StaticSection heading={c.farmersH}>
        <p>
          {c.farmers}{' '}
          <Link
            href="/how-it-works"
            className="text-forest-700 font-semibold no-underline hover:underline"
          >
            {c.farmersCta}
          </Link>
          .
        </p>
      </StaticSection>
      <div>
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 text-body font-semibold no-underline"
        >
          {c.shopCta}
        </Link>
      </div>
    </StaticShell>
  );
}
