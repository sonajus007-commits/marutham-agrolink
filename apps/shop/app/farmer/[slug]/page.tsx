import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { FARMER_STORIES, getStory, sampleLabel, farmerFace } from '@/lib/farmerStories';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';

/* /farmer/[slug] — one farmer's story. Backed by the ILLUSTRATIVE sample stories
 * today (clearly marked); swaps to real consented farmers later. Unknown slugs
 * 404 (a real not-found, good for crawlers), never a blank profile. */
export const revalidate = 300;

export function generateStaticParams() {
  return FARMER_STORIES.map((s) => ({ slug: s.id }));
}

async function lang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const s = getStory(slug);
  if (!s) return { title: 'Farmer — Marutham AgroLink' };
  const title = `${s.name}, ${s.village} — Marutham AgroLink`;
  const desc = s.quote[DEFAULT_LANG];
  return {
    title,
    description: desc,
    alternates: { canonical: `/farmer/${s.id}` },
    openGraph: { title, description: desc, type: 'profile', url: absoluteUrl(`/farmer/${s.id}`) },
  };
}

export default async function FarmerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getStory(slug);
  if (!s) notFound();

  const l = await lang();
  const t = DICT[l];
  const back = l === 'ta' ? '← அனைத்து விவசாயிகள்' : '← All farmers';
  const shop = l === 'ta' ? 'புதிய பொருட்களை வாங்குங்கள் →' : 'Shop fresh produce →';
  const sampleNote =
    l === 'ta'
      ? 'இது ஒரு மாதிரிக் கதை. உண்மையான, சம்மதம் அளித்த விவசாயிகளின் கதைகள் விரைவில்.'
      : 'This is a sample story. Real, consented farmer stories are coming soon.';

  return (
    <>
      <SiteHeader t={t} lang={l} />

      <main className="mx-auto max-w-3xl px-5 py-12">
        <Link
          href="/farmers"
          className="text-forest-700 hover:text-forest-900 text-caption font-semibold no-underline"
        >
          {back}
        </Link>

        <div className="mt-6 flex items-center gap-4">
          <span
            className="grid h-20 w-20 shrink-0 place-items-center rounded-full text-4xl ring-2 ring-white shadow-[0_12px_30px_-14px_rgba(22,61,47,0.5)]"
            style={{ background: 'linear-gradient(135deg,#8fce9a,#2e7d32)' }}
            role="img"
            aria-label={l === 'ta' ? 'விவசாயி (படம் மாதிரி)' : 'Farmer (sample illustration)'}
          >
            {farmerFace(s)}
          </span>
          <div>
            <span className="bg-blossom-500/12 text-blossom-ink inline-flex rounded-full px-2.5 py-1 text-[0.7rem] font-bold">
              {sampleLabel(l)}
            </span>
            <h1 className="text-forest-900 mt-1.5 text-3xl font-bold tracking-tight">{s.name}</h1>
            <p className="text-fg-muted text-body">{s.village}</p>
          </div>
        </div>

        <blockquote className="text-fg mt-8 border-l-4 border-forest-500 pl-5 text-xl leading-relaxed">
          “{s.quote[l]}”
        </blockquote>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="bg-blossom-500/12 text-blossom-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-bold">
            <span aria-hidden="true">🏷</span>
            {s.benefit[l]}
          </span>
        </div>

        <p className="text-fg-muted mt-8 rounded-xl border border-dashed border-border px-4 py-3 text-caption">
          {sampleNote}
        </p>

        <div className="mt-8">
          <Link
            href="/products"
            className="text-forest-700 hover:text-forest-900 text-body font-semibold no-underline"
          >
            {shop}
          </Link>
        </div>
      </main>

      <SiteFooter t={t} c={LANDING[l]} />
    </>
  );
}
