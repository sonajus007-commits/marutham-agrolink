import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { absoluteUrl } from '@/lib/site';
import type { Lang } from '@/lib/dict';
import { StaticShell, StaticSection } from '@/components/StaticShell';

export const revalidate = 3600;

/* A placeholder Terms page. Real terms are a legal document the company must
 * author and have reviewed — this page does NOT invent binding terms; it states
 * that they are being finalised and outlines what they will cover. It is
 * noindex until the real, reviewed policy replaces this. */

const C: Record<Lang, ReturnType<typeof en>> = { en: en(), ta: ta() };

function en() {
  return {
    meta: 'Terms of Service — Marutham AgroLink',
    eyebrow: 'Terms of Service',
    title: 'Terms of Service',
    lede: 'These terms are being finalised. The published version will be reviewed before it takes effect; nothing here is binding yet.',
    coversH: 'What the terms will cover',
    covers: [
      'Who may use the marketplace, and account responsibilities',
      'How orders, pricing, delivery and cancellations work',
      'Obligations of farmers, delivery partners and buyers',
      'Payments, fees and refunds',
      'Acceptable use, liability and dispute resolution',
      'Governing law (India / Tamil Nadu)',
    ],
    note: 'Until then, using Marutham Agrolink is subject to the arrangements described in How It Works and About.',
  };
}

function ta(): ReturnType<typeof en> {
  return {
    meta: 'சேவை விதிமுறைகள் — மருதம் அக்ரோலிங்க்',
    eyebrow: 'சேவை விதிமுறைகள்',
    title: 'சேவை விதிமுறைகள்',
    lede: 'இந்த விதிமுறைகள் இறுதி செய்யப்படுகின்றன. வெளியிடப்படும் பதிப்பு நடைமுறைக்கு வருமுன் மதிப்பாய்வு செய்யப்படும்; இங்குள்ள எதுவும் இன்னும் கட்டுப்படுத்தும் தன்மை கொண்டதல்ல.',
    coversH: 'விதிமுறைகள் உள்ளடக்கியவை',
    covers: [
      'சந்தையைப் பயன்படுத்தக்கூடியவர் மற்றும் கணக்குப் பொறுப்புகள்',
      'ஆர்டர்கள், விலை, டெலிவரி, ரத்து ஆகியவை எப்படி இயங்குகின்றன',
      'விவசாயிகள், டெலிவரி பங்குதாரர்கள், வாங்குபவர்களின் கடமைகள்',
      'கட்டணங்கள், கட்டணம் மற்றும் திரும்பப் பணம்',
      'ஏற்கத்தக்க பயன்பாடு, பொறுப்பு மற்றும் தகராறு தீர்வு',
      'ஆளும் சட்டம் (இந்தியா / தமிழ்நாடு)',
    ],
    note: 'அதுவரை, மருதம் அக்ரோலிங்க் பயன்பாடு "எப்படி வேலை செய்கிறது" மற்றும் "எங்களைப் பற்றி" பக்கங்களில் விவரிக்கப்பட்ட ஏற்பாடுகளுக்கு உட்பட்டது.',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = C[await getLang()];
  return {
    title: c.meta,
    description: c.lede,
    alternates: { canonical: '/terms' },
    robots: { index: false, follow: true },
    openGraph: { title: c.meta, description: c.lede, type: 'website', url: absoluteUrl('/terms') },
  };
}

export default async function TermsPage() {
  const lang = await getLang();
  const c = C[lang];
  return (
    <StaticShell lang={lang} eyebrow={c.eyebrow} title={c.title} lede={c.lede}>
      <StaticSection heading={c.coversH}>
        <ul className="text-fg-muted flex list-disc flex-col gap-2 pl-5">
          {c.covers.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
      </StaticSection>
      <p className="text-fg-muted border-border rounded-xl border border-dashed px-4 py-3 text-caption">
        {c.note}
      </p>
    </StaticShell>
  );
}
