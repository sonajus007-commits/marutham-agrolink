import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getPublicFarmer, type PublicFarmer } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import { getLang } from '@/lib/lang';
import { DICT } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import {
  FARMER_STORIES,
  getStory,
  sampleLabel,
  farmerFace,
  type FarmerStory,
} from '@/lib/farmerStories';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';

/* /farmer/[slug] — one farmer.
 *
 * Resolution order: a REAL consented farmer by id (getPublicFarmer) first, then
 * an ILLUSTRATIVE sample story by slug, else 404. A real profile carries no
 * "Sample" marking; a sample one does. Real growers only ever appear here with
 * consent (public_profile = true). */
export const revalidate = 300;

// Pre-render the sample slugs; real farmer ids (uuids) render on demand.
export function generateStaticParams() {
  return FARMER_STORIES.map((s) => ({ slug: s.id }));
}

type Resolved =
  { kind: 'real'; farmer: PublicFarmer } | { kind: 'sample'; story: FarmerStory } | null;

async function resolve(slug: string): Promise<Resolved> {
  const real = await getPublicFarmer(slug);
  if (real) return { kind: 'real', farmer: real };
  const story = getStory(slug);
  if (story) return { kind: 'sample', story };
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const r = await resolve(slug);
  if (!r) return { title: 'Farmer — Marutham AgroLink' };
  const name = r.kind === 'real' ? r.farmer.name || 'Farmer' : r.story.name;
  const place =
    r.kind === 'real'
      ? [r.farmer.village, r.farmer.district].filter(Boolean).join(', ')
      : r.story.village;
  const desc = r.kind === 'real' ? r.farmer.bio || '' : r.story.quote.en;
  const title = `${name}${place ? `, ${place}` : ''} — Marutham AgroLink`;
  return {
    title,
    description: desc,
    alternates: { canonical: `/farmer/${slug}` },
    // Real, consented profiles are indexable; sample ones are noindex.
    robots: r.kind === 'real' ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: { title, description: desc, type: 'profile', url: absoluteUrl(`/farmer/${slug}`) },
  };
}

const PORTRAIT_BG = { background: 'linear-gradient(135deg,#8fce9a,#2e7d32)' };

export default async function FarmerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await resolve(slug);
  if (!r) notFound();

  const l = await getLang();
  const t = DICT[l];
  const back = l === 'ta' ? '← அனைத்து விவசாயிகள்' : '← All farmers';
  const shop = l === 'ta' ? 'புதிய பொருட்களை வாங்குங்கள் →' : 'Shop fresh produce →';

  const isReal = r.kind === 'real';
  const name = isReal ? r.farmer.name || (l === 'ta' ? 'விவசாயி' : 'Farmer') : r.story.name;
  const place = isReal
    ? [r.farmer.village, r.farmer.district].filter(Boolean).join(', ')
    : r.story.village;
  const quote = isReal ? r.farmer.bio : r.story.quote[l];

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
            className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full text-4xl shadow-[0_12px_30px_-14px_rgba(22,61,47,0.5)] ring-2 ring-white"
            style={PORTRAIT_BG}
            aria-hidden="true"
          >
            {isReal ? (
              r.farmer.photo_url ? (
                <img src={r.farmer.photo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                '🧑‍🌾'
              )
            ) : (
              farmerFace(r.story)
            )}
          </span>
          <div>
            {isReal ? null : (
              <span className="bg-blossom-500/12 text-blossom-ink inline-flex rounded-full px-2.5 py-1 text-[0.7rem] font-bold">
                {sampleLabel(l)}
              </span>
            )}
            <h1 className="text-forest-900 mt-1.5 text-3xl font-bold tracking-tight">{name}</h1>
            {place ? <p className="text-fg-muted text-body">{place}</p> : null}
          </div>
        </div>

        {quote ? (
          <blockquote className="text-fg border-forest-500 mt-8 border-l-4 pl-5 text-xl leading-relaxed">
            “{quote}”
          </blockquote>
        ) : null}

        {isReal ? null : (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span className="bg-blossom-500/12 text-blossom-ink inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-bold">
              <span aria-hidden="true">🏷</span>
              {r.story.benefit[l]}
            </span>
          </div>
        )}

        {isReal ? null : (
          <p className="text-fg-muted border-border mt-8 rounded-xl border border-dashed px-4 py-3 text-caption">
            {l === 'ta'
              ? 'இது ஒரு மாதிரிக் கதை. உண்மையான, சம்மதம் அளித்த விவசாயிகளின் கதைகள் விரைவில்.'
              : 'This is a sample story. Real, consented farmer stories are coming soon.'}
          </p>
        )}

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
