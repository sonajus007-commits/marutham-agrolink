import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { absoluteUrl } from '@/lib/site';
import type { Lang } from '@/lib/dict';
import { StaticShell, StaticSection } from '@/components/StaticShell';

export const revalidate = 3600;

/* A placeholder Privacy page. A privacy policy is a legal document about how real
 * personal data is handled — this page does NOT invent one; it states that the
 * policy is being finalised and outlines what it will cover. noindex until the
 * real, reviewed policy replaces this. */

const C: Record<Lang, ReturnType<typeof en>> = { en: en(), ta: ta() };

function en() {
  return {
    meta: 'Privacy Policy — Marutham AgroLink',
    eyebrow: 'Privacy Policy',
    title: 'Privacy Policy',
    lede: 'Our privacy policy is being finalised and will be reviewed before it takes effect. This page outlines what it will cover.',
    coversH: 'What the policy will cover',
    covers: [
      'What personal data we collect, and why',
      'How your data is used to run orders and delivery',
      'Who your data is and is not shared with',
      'How grower identity is protected on public pages',
      'Data security, retention and your rights',
      'How to contact us about your data',
    ],
    note: 'Marutham keeps grower identity off public pages by design — a farmer’s name is never shown to an anonymous visitor. The full policy will set out the rest.',
  };
}

function ta(): ReturnType<typeof en> {
  return {
    meta: 'தனியுரிமைக் கொள்கை — மருதம் அக்ரோலிங்க்',
    eyebrow: 'தனியுரிமைக் கொள்கை',
    title: 'தனியுரிமைக் கொள்கை',
    lede: 'எங்கள் தனியுரிமைக் கொள்கை இறுதி செய்யப்படுகிறது, நடைமுறைக்கு வருமுன் மதிப்பாய்வு செய்யப்படும். இந்தப் பக்கம் அது உள்ளடக்கியதை விவரிக்கிறது.',
    coversH: 'கொள்கை உள்ளடக்கியவை',
    covers: [
      'நாங்கள் எந்தத் தனிப்பட்ட தரவைச் சேகரிக்கிறோம், ஏன்',
      'ஆர்டர்கள், டெலிவரிக்கு உங்கள் தரவு எப்படிப் பயன்படுத்தப்படுகிறது',
      'உங்கள் தரவு யாருடன் பகிரப்படுகிறது, யாருடன் இல்லை',
      'பொது பக்கங்களில் விவசாயி அடையாளம் எப்படிப் பாதுகாக்கப்படுகிறது',
      'தரவுப் பாதுகாப்பு, தக்கவைப்பு மற்றும் உங்கள் உரிமைகள்',
      'உங்கள் தரவு குறித்து எங்களைத் தொடர்பு கொள்வது எப்படி',
    ],
    note: 'மருதம் விவசாயி அடையாளத்தை பொது பக்கங்களில் காட்டுவதில்லை — அநாமதேய பார்வையாளருக்கு விவசாயியின் பெயர் ஒருபோதும் காட்டப்படாது. முழுக் கொள்கை மற்றவற்றைக் குறிப்பிடும்.',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = C[await getLang()];
  return {
    title: c.meta,
    description: c.lede,
    alternates: { canonical: '/privacy' },
    robots: { index: false, follow: true },
    openGraph: {
      title: c.meta,
      description: c.lede,
      type: 'website',
      url: absoluteUrl('/privacy'),
    },
  };
}

export default async function PrivacyPage() {
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
