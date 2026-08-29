import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicFarmers } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import { getLang } from '@/lib/lang';
import { DICT, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { recentStories, sampleLabel, farmerFace } from '@/lib/farmerStories';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';

/* /farmers — the public farmer directory.
 *
 * It prefers REAL, consented farmers (getPublicFarmers → the consent-gated
 * /farmers/public endpoint). Until any farmer opts in, it falls back to the
 * ILLUSTRATIVE sample stories, clearly marked "Sample". The moment a farmer
 * consents (public_profile = true), their real card replaces the samples — no
 * code change needed. Real growers are never shown without consent. */
export const revalidate = 300;

function copyFor(l: Lang, sample: boolean) {
  const ta = l === 'ta';
  return {
    eyebrow: ta
      ? `விவசாயி கதைகள்${sample ? ` · ${sampleLabel(l)}` : ''}`
      : `Farmer stories${sample ? ` · ${sampleLabel(l)}` : ''}`,
    title: ta ? 'எங்கள் விவசாயிகளை சந்தியுங்கள்' : 'Meet our farmers',
    lede: sample
      ? ta
        ? 'மருதம் அக்ரோலிங்க் விவசாயிகளின் வாழ்வை எப்படி மாற்றுகிறது. இவை மாதிரிக் கதைகள் — உண்மையான, சம்மதம் அளித்த விவசாயிகளின் கதைகள் விரைவில்.'
        : 'How Marutham AgroLink is changing what a farming day looks like. These are sample stories — real, consented farmer stories are coming soon.'
      : ta
        ? 'மருதம் அக்ரோலிங்க் மூலம் நேரடியாக விற்கும், பொதுவில் தோன்ற சம்மதித்த விவசாயிகள்.'
        : 'Growers who sell direct through Marutham AgroLink and chose to appear here.',
    read: ta ? 'கதையைப் படியுங்கள் →' : 'Read the story →',
    meta: ta ? 'எங்கள் விவசாயிகள் — மருதம் அக்ரோலிங்க்' : 'Our Farmers — Marutham AgroLink',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const c = copyFor(await getLang(), true);
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

const CARD =
  'border-border bg-surface-raised group flex h-full flex-col gap-4 rounded-2xl border p-6 no-underline transition-shadow hover:shadow-[0_16px_40px_-20px_rgba(22,61,47,0.35)]';
const PORTRAIT =
  'grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full text-2xl ring-2 ring-white';
const PORTRAIT_BG = { background: 'linear-gradient(135deg,#8fce9a,#2e7d32)' };

export default async function FarmersPage() {
  const l = await getLang();
  const t = DICT[l];
  const real = await getPublicFarmers();
  const useReal = real.length > 0;
  const c = copyFor(l, !useReal);

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
          {useReal
            ? real.map((f) => (
                <li key={f.id}>
                  <Link href={`/farmer/${f.id}`} className={CARD}>
                    <div className="flex items-center gap-3">
                      <span className={PORTRAIT} style={PORTRAIT_BG} aria-hidden="true">
                        {f.photo_url ? (
                          <img src={f.photo_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          '🧑‍🌾'
                        )}
                      </span>
                      <span className="leading-tight">
                        <span className="text-forest-900 block text-card font-bold">
                          {f.name || (l === 'ta' ? 'விவசாயி' : 'Farmer')}
                        </span>
                        {f.village || f.district ? (
                          <span className="text-fg-muted block text-caption">
                            {[f.village, f.district].filter(Boolean).join(', ')}
                          </span>
                        ) : null}
                      </span>
                    </div>
                    {f.bio ? (
                      <p className="text-fg line-clamp-3 text-caption leading-relaxed">“{f.bio}”</p>
                    ) : null}
                    <span className="text-forest-700 group-hover:text-forest-900 mt-auto text-caption font-semibold">
                      {c.read}
                    </span>
                  </Link>
                </li>
              ))
            : recentStories().map((s) => (
                <li key={s.id}>
                  <Link href={`/farmer/${s.id}`} className={CARD}>
                    <div className="flex items-center gap-3">
                      <span className={PORTRAIT} style={PORTRAIT_BG} aria-hidden="true">
                        {farmerFace(s)}
                      </span>
                      <span className="leading-tight">
                        <span className="text-forest-900 block text-card font-bold">{s.name}</span>
                        <span className="text-fg-muted block text-caption">{s.village}</span>
                      </span>
                    </div>
                    <p className="text-fg line-clamp-3 text-caption leading-relaxed">
                      “{s.quote[l]}”
                    </p>
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
