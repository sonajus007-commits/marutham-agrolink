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
    meta: 'About — Marutham AgroLink',
    eyebrow: 'About Marutham Agrolink',
    title: 'Fair prices for farmers. Fresh food for families.',
    lede: 'Marutham Agrolink Private Limited is a digital agriculture marketplace connecting farmers directly to consumers across Tamil Nadu — starting in Pudukkottai.',
    sections: [
      [
        'Why we exist',
        'For too long the farmer took whatever the agent offered, and the family paid whatever the market asked — with several hands in between. We remove those hands: the farmer names the price, the family buys the same day it is harvested, and every step in between is tracked.',
      ],
      [
        'How it is different',
        'No auction and no commission agent. The grower sets the price and is paid it; the platform fee is added on top, never taken out. Produce is weighed and quality-checked at a Marutham hub in the open, then dispatched on the shortest route to the door.',
      ],
      [
        'Where we are',
        'We are starting in Pudukkottai, Tamil Nadu, and growing district by district across the state. Our farmers, hubs and delivery partners are all local.',
      ],
    ],
    values: {
      h: 'What we stand for',
      items: [
        'Fair prices',
        'Freshness you can time',
        'Full traceability',
        'Local farmers',
        'Sustainable packaging',
        'Reliable delivery',
      ],
    },
    cta: 'See how it works →',
  };
}

function ta(): ReturnType<typeof en> {
  return {
    meta: 'எங்களைப் பற்றி — மருதம் அக்ரோலிங்க்',
    eyebrow: 'மருதம் அக்ரோலிங்க் பற்றி',
    title: 'விவசாயிகளுக்கு நியாயமான விலை. குடும்பங்களுக்கு புதிய உணவு.',
    lede: 'மருதம் அக்ரோலிங்க் பிரைவேட் லிமிடெட் என்பது தமிழ்நாடு முழுவதும் விவசாயிகளை நேரடியாக நுகர்வோருடன் இணைக்கும் ஒரு டிஜிட்டல் விவசாய சந்தை — புதுக்கோட்டையில் தொடங்குகிறது.',
    sections: [
      [
        'நாங்கள் ஏன் இருக்கிறோம்',
        'நீண்ட காலமாக விவசாயி தரகர் தந்ததை எடுத்துக்கொண்டார், குடும்பம் சந்தை கேட்டதைச் செலுத்தியது — இடையில் பல கைகள். அந்தக் கைகளை நாங்கள் நீக்குகிறோம்: விவசாயி விலையைச் சொல்கிறார், அறுவடை செய்த அன்றே குடும்பம் வாங்குகிறது, இடையிலுள்ள ஒவ்வொரு நிலையும் கண்காணிக்கப்படுகிறது.',
      ],
      [
        'இது எப்படி வேறுபடுகிறது',
        'ஏலம் இல்லை, தரகர் இல்லை. விளைவித்தவர் விலையை நிர்ணயித்து அதைப் பெறுகிறார்; கட்டணம் மேலே சேர்க்கப்படுகிறது, எடுக்கப்படுவதில்லை. விளைபொருட்கள் மருதம் மையத்தில் வெளிப்படையாக எடைபோட்டு தரம் சரிபார்க்கப்பட்டு, குறுகிய வழியில் வாசலுக்கு அனுப்பப்படுகின்றன.',
      ],
      [
        'நாங்கள் எங்கே',
        'புதுக்கோட்டை, தமிழ்நாட்டில் தொடங்கி, மாவட்டம் மாவட்டமாக வளர்கிறோம். எங்கள் விவசாயிகள், மையங்கள், டெலிவரி பங்குதாரர்கள் அனைவரும் உள்ளூர்.',
      ],
    ],
    values: {
      h: 'நாங்கள் எதற்காக நிற்கிறோம்',
      items: [
        'நியாயமான விலை',
        'நேரம் அறியக்கூடிய புத்தம்',
        'முழு கண்காணிப்பு',
        'உள்ளூர் விவசாயிகள்',
        'சுற்றுச்சூழல் பேக்கேஜிங்',
        'நம்பகமான டெலிவரி',
      ],
    },
    cta: 'எப்படி வேலை செய்கிறது →',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = C[await getLang()];
  return {
    title: c.meta,
    description: c.lede,
    alternates: { canonical: '/about' },
    openGraph: { title: c.meta, description: c.lede, type: 'website', url: absoluteUrl('/about') },
  };
}

export default async function AboutPage() {
  const lang = await getLang();
  const c = C[lang];
  return (
    <StaticShell lang={lang} eyebrow={c.eyebrow} title={c.title} lede={c.lede}>
      {c.sections.map(([h, body]) => (
        <StaticSection key={h} heading={h}>
          <p>{body}</p>
        </StaticSection>
      ))}
      <StaticSection heading={c.values.h}>
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {c.values.items.map((v) => (
            <li
              key={v}
              className="bg-mist text-forest-700 rounded-full px-3 py-1.5 text-caption font-semibold"
            >
              {v}
            </li>
          ))}
        </ul>
      </StaticSection>
      <div>
        <Link
          href="/how-it-works"
          className="text-forest-700 hover:text-forest-900 text-body font-semibold no-underline"
        >
          {c.cta}
        </Link>
      </div>
    </StaticShell>
  );
}
