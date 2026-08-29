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
    meta: 'How It Works — Marutham AgroLink',
    eyebrow: 'How it works',
    title: 'From a Tamil Nadu field to your door',
    lede: 'Marutham AgroLink connects farmers directly to families — no auction, no commission agent. Here is what happens between the field and your kitchen.',
    families: {
      h: 'For families',
      steps: [
        [
          'Browse what is fresh today',
          'You see only what growers near you have confirmed for the day — with a real cutoff time, not a slogan.',
        ],
        ['Order in a minute', 'Add to your basket and check out. Pay by UPI or cash on delivery.'],
        [
          'Follow it live',
          'Collection, hub, dispatch, doorstep — every step is scanned as it happens.',
        ],
        ['Rate the grower', 'Your rating goes to the farmer who actually grew it, by name.'],
      ],
    },
    farmers: {
      h: 'For farmers',
      steps: [
        ['List your produce', 'Add what you have, the quantity, and the price you want for it.'],
        [
          'Set your own price',
          'No auction and no agent deciding for you. The platform fee sits on top, never taken out of your price.',
        ],
        [
          'Confirm this morning',
          'Say what is actually available today and set the cutoff — after that it comes off the shop.',
        ],
        [
          'Get paid your price',
          'Your payout is your price times the quantity sold, settled quickly.',
        ],
      ],
    },
    flow: {
      h: 'The four steps',
      steps: [
        ['Farmer', 'Fresh produce sourced from participating farmers near you.'],
        ['Marutham Hub', 'Received, weighed, quality-checked and prepared for dispatch.'],
        ['Delivery Partner', 'Carefully packed and dispatched on the shortest route.'],
        ['Your Home', 'Delivered fresh to your door — farm to family.'],
      ],
    },
    cta: 'Browse today’s produce →',
  };
}

function ta(): ReturnType<typeof en> {
  return {
    meta: 'எப்படி வேலை செய்கிறது — மருதம் அக்ரோலிங்க்',
    eyebrow: 'எப்படி வேலை செய்கிறது',
    title: 'தமிழ்நாட்டு வயலிலிருந்து உங்கள் வாசல் வரை',
    lede: 'மருதம் அக்ரோலிங்க் விவசாயிகளை நேரடியாகக் குடும்பங்களுடன் இணைக்கிறது — ஏலம் இல்லை, தரகர் இல்லை. வயலுக்கும் உங்கள் சமையலறைக்கும் இடையே என்ன நடக்கிறது என்பது இதோ.',
    families: {
      h: 'குடும்பங்களுக்கு',
      steps: [
        [
          'இன்று புதியதைப் பாருங்கள்',
          'உங்கள் அருகில் உள்ள விவசாயிகள் இன்றைக்கு உறுதி செய்ததை மட்டுமே பார்க்கிறீர்கள் — உண்மையான கடைசி நேரத்துடன்.',
        ],
        [
          'ஒரு நிமிடத்தில் ஆர்டர்',
          'கூடையில் சேர்த்து செக் அவுட் செய்யுங்கள். UPI அல்லது டெலிவரியில் பணம்.',
        ],
        [
          'நேரலையில் பின்தொடருங்கள்',
          'சேகரிப்பு, மையம், அனுப்புதல், வாசல் — ஒவ்வொரு நிலையும் ஸ்கேன் செய்யப்படுகிறது.',
        ],
        ['விவசாயியை மதிப்பிடுங்கள்', 'உங்கள் மதிப்பீடு விளைவித்த விவசாயிக்கு பெயருடன் செல்கிறது.'],
      ],
    },
    farmers: {
      h: 'விவசாயிகளுக்கு',
      steps: [
        [
          'உங்கள் விளைபொருளைப் பட்டியலிடுங்கள்',
          'உங்களிடம் உள்ளது, அளவு, நீங்கள் விரும்பும் விலை ஆகியவற்றைச் சேர்க்கவும்.',
        ],
        [
          'உங்கள் விலையை நீங்களே நிர்ணயியுங்கள்',
          'ஏலமும் இல்லை, தரகரும் இல்லை. கட்டணம் உங்கள் விலையின் மேல் சேர்க்கப்படுகிறது, எடுக்கப்படுவதில்லை.',
        ],
        [
          'இன்று காலை உறுதி செய்யுங்கள்',
          'இன்று உண்மையில் கிடைப்பதைச் சொல்லி கடைசி நேரத்தை அமைக்கவும்.',
        ],
        [
          'உங்கள் விலையைப் பெறுங்கள்',
          'உங்கள் வருமானம் = உங்கள் விலை × விற்பனையான அளவு, விரைவாகச் செலுத்தப்படும்.',
        ],
      ],
    },
    flow: {
      h: 'நான்கு படிகள்',
      steps: [
        ['விவசாயி', 'உங்களுக்கு அருகிலுள்ள விவசாயிகளிடமிருந்து புதிய விளைபொருட்கள்.'],
        ['மருதம் மையம்', 'பெறப்பட்டு, எடைபோட்டு, தரம் சரிபார்க்கப்பட்டு அனுப்பத் தயாராகிறது.'],
        ['டெலிவரி பங்குதாரர்', 'கவனமாகப் பொதிசெய்து குறுகிய வழியில் அனுப்பப்படுகிறது.'],
        ['உங்கள் வீடு', 'புதியதாக உங்கள் வாசலில் வழங்கப்படுகிறது.'],
      ],
    },
    cta: 'இன்றைய பொருட்களைப் பாருங்கள் →',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = C[await getLang()];
  return {
    title: c.meta,
    description: c.lede,
    alternates: { canonical: '/how-it-works' },
    openGraph: {
      title: c.meta,
      description: c.lede,
      type: 'website',
      url: absoluteUrl('/how-it-works'),
    },
  };
}

function Steps({ steps }: { steps: [string, string][] }) {
  return (
    <ol className="flex list-none flex-col gap-4 p-0">
      {steps.map(([h, d], i) => (
        <li key={h} className="flex gap-4">
          <span className="bg-forest-700 text-surface grid h-7 w-7 shrink-0 place-items-center rounded-full text-caption font-bold">
            {i + 1}
          </span>
          <span>
            <span className="text-forest-900 block font-semibold">{h}</span>
            <span className="text-fg-muted block text-caption leading-relaxed">{d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function HowItWorksPage() {
  const lang = await getLang();
  const c = C[lang];
  return (
    <StaticShell lang={lang} eyebrow={c.eyebrow} title={c.title} lede={c.lede}>
      <StaticSection heading={c.families.h}>
        <Steps steps={c.families.steps as [string, string][]} />
      </StaticSection>
      <StaticSection heading={c.farmers.h}>
        <Steps steps={c.farmers.steps as [string, string][]} />
      </StaticSection>
      <StaticSection heading={c.flow.h}>
        <ol className="grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-2">
          {c.flow.steps.map(([h, d], i) => (
            <li key={h} className="border-border bg-surface-raised rounded-2xl border p-4">
              <span className="text-blossom-ink text-caption font-bold">0{i + 1}</span>
              <span className="text-forest-900 mt-1 block font-semibold">{h}</span>
              <span className="text-fg-muted mt-1 block text-caption leading-relaxed">{d}</span>
            </li>
          ))}
        </ol>
      </StaticSection>
      <div>
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 text-body font-semibold no-underline"
        >
          {c.cta}
        </Link>
      </div>
    </StaticShell>
  );
}
