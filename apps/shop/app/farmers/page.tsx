import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { recentStories, sampleLabel, farmerFace } from '@/lib/farmerStories';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';

/* /farmers — the public directory of farmer stories. Today it is backed by the
 * ILLUSTRATIVE sample stories (lib/farmerStories.ts) and is clearly marked as
 * such, because the platform anonymises real growers publicly (district only,
 * never a name — backend/utils/publicShape.js). When a consent/opt-in model
 * exists and farmers choose to appear, swap the data source: the page and the
 * /farmer/[slug] profiles stay the same. */
export const revalidate = 300;

async function lang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

function copyFor(l: Lang) {
  return l === 'ta'
    ? {
        eyebrow: `விவசாயி கதைகள் · ${sampleLabel(l)}`,
        title: 'எங்கள் விவசாயிகளை சந்தியுங்கள்',
        lede: 'மருதம் அக்ரோலிங்க் விவசாயிகளின் வாழ்வை எப்படி மாற்றுகிறது. இவை மாதிரிக் கதைகள் — உண்மையான, சம்மதம் அளித்த விவசாயிகளின் கதைகள் விரைவில்.',
        read: 'கதையைப் படியுங்கள் →',
        meta: 'எங்கள் விவசாயிகள் — மருதம் அக்ரோலிங்க்',
      }
    : {
        eyebrow: `Farmer stories · ${sampleLabel(l)}`,
        title: 'Meet our farmers',
        lede: 'How Marutham AgroLink is changing what a farming day looks like. These are sample stories — real, consented farmer stories are coming soon.',
        read: 'Read the story →',
        meta: 'Our Farmers — Marutham AgroLink',
      };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copyFor(await lang());
  return {
    title: c.meta,
    description: c.lede,
    alternates: { canonical: '/farmers' },
    openGraph: {
      title: c.meta,
      description: c.lede,
      type: 'website',
      url: absoluteUrl('/farmers'),
    },
  };
}

export default async function FarmersPage() {
  const l = await lang();
  const t = DICT[l];
  const c = copyFor(l);
  const stories = recentStories();

  return (
    <>
      <SiteHeader t={t} lang={l} />

      <main className="mx-auto max-w-6xl px-5 py-12">
        <span className="text-blossom-ink text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
          {c.eyebrow}
        </span>
        <h1 className="text-forest-900 mt-3 text-3xl font-bold tracking-tight md:text-4xl">
          {c.title}
        </h1>
        <p className="text-fg-muted mt-3 max-w-[60ch] text-body">{c.lede}</p>

        <ul className="mt-10 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {stories.map((s) => (
            <li key={s.id}>
              <Link
                href={`/farmer/${s.id}`}
                className="border-border bg-surface-raised group flex h-full flex-col gap-4 rounded-2xl border p-6 no-underline transition-shadow hover:shadow-[0_16px_40px_-20px_rgba(22,61,47,0.35)]"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl ring-2 ring-white"
                    style={{ background: 'linear-gradient(135deg,#8fce9a,#2e7d32)' }}
                    aria-hidden="true"
                  >
                    {farmerFace(s)}
                  </span>
                  <span className="leading-tight">
                    <span className="text-forest-900 block text-card font-bold">{s.name}</span>
                    <span className="text-fg-muted block text-caption">{s.village}</span>
                  </span>
                </div>
                <p className="text-fg line-clamp-3 text-caption leading-relaxed">“{s.quote[l]}”</p>
                <span className="text-forest-700 group-hover:text-forest-900 mt-auto text-caption font-semibold">
                  {c.read}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>

      <SiteFooter t={t} c={LANDING[l]} />
    </>
  );
}
