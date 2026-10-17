import { LocaleLink as Link } from '@/components/LocaleLink';
import { MapPin, Sprout } from 'lucide-react';
import type { Product } from '@marutham/lib';
import type { Lang } from '@/lib/dict';
import type { PublicFarmer } from '@/lib/api';
import { Section, SectionHeader } from '@/components/ui/Section';

/* Meet Our Farmers — the model's farmer row, kept HONEST.
 *
 * Real people first: growers who opted in to a public profile (migration 050,
 * the consent-gated /farmers/public endpoint) appear by name, with their photo
 * if they gave one, linking to their /farmer page. Nobody appears without that
 * consent — the product API itself only ever says "district" (backend/utils/
 * publicShape.js).
 *
 * Until the first farmer opts in, the row falls back to the real DISTRICTS the
 * live catalogue is sourced from, so it still says something true rather than
 * inventing people. */

const AVATAR = ['bg-forest-700', 'bg-blossom-500', 'bg-water-500', 'bg-earth-500'];

function tidy(d: string): string {
  return d.replace(/\s+district$/i, '').trim();
}

export function MeetFarmers({
  farmers,
  products,
  lang,
}: {
  farmers: PublicFarmer[];
  products: Product[];
  lang: Lang;
}) {
  const real = farmers.slice(0, 6);
  const districts = new Set<string>();
  for (const p of products) {
    for (const dp of p.product_district_prices ?? []) {
      const d = dp.district ? tidy(dp.district) : '';
      if (d) districts.add(d);
    }
  }
  const list = [...districts].sort((a, b) => a.localeCompare(b)).slice(0, 6);
  if (real.length === 0 && list.length === 0) return null;

  const copy =
    lang === 'ta'
      ? {
          eyebrow: 'எங்கள் விவசாயிகள்',
          title: 'விளைவித்தவரை அறியுங்கள்',
          lede: real.length
            ? 'மருதம் மூலம் நேரடியாக விற்கும், இங்கு தோன்ற சம்மதித்த விவசாயிகள்.'
            : 'நாங்கள் வாங்கும் மாவட்டங்களில் உள்ள சரிபார்க்கப்பட்ட விவசாயிகள். பெயருடன் கூடிய விவரங்கள் விரைவில்.',
          role: 'சரிபார்க்கப்பட்ட விவசாயிகள்',
          farmer: 'விவசாயி',
          cta: real.length ? 'அனைத்து விவசாயிகள் →' : 'அவர்களின் விளைபொருட்களை வாங்குங்கள் →',
        }
      : {
          eyebrow: 'Our farmers',
          title: 'Meet the growers behind your food',
          lede: real.length
            ? 'Growers who sell direct through Marutham and chose to appear here.'
            : 'Verified farmers in the districts we source from. Named profiles arrive as growers opt in.',
          role: 'Verified growers',
          farmer: 'Farmer',
          cta: real.length ? 'See all farmers →' : 'Shop their produce →',
        };

  return (
    <Section id="farmers" tone="surface" aria-labelledby="farmers-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          id="farmers-h"
          eyebrow={copy.eyebrow}
          accent="blossom"
          title={copy.title}
          lede={copy.lede}
        />
        <Link
          href={real.length ? '/farmers' : '/products'}
          className="text-forest-700 hover:text-forest-900 inline-flex min-h-11 shrink-0 items-center text-caption font-semibold no-underline"
        >
          {copy.cta}
        </Link>
      </div>

      <ul className="mt-12 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {real.length
          ? real.map((f, i) => {
              const name = f.name || copy.farmer;
              const place = f.village || (f.district ? tidy(f.district) : '');
              return (
                <li key={f.id}>
                  <Link
                    href={`/farmer/${f.id}`}
                    className="border-border bg-surface-raised flex h-full flex-col items-center gap-3 rounded-2xl border p-5 text-center no-underline transition-shadow hover:shadow-[0_16px_40px_-20px_rgba(22,61,47,0.35)]"
                  >
                    <span
                      className={`${AVATAR[i % AVATAR.length]} relative grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white`}
                    >
                      {f.photo_url ? (
                        <img
                          src={f.photo_url}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        name.slice(0, 1).toUpperCase()
                      )}
                      <span
                        className="bg-surface absolute -right-1 -bottom-1 grid h-6 w-6 place-items-center rounded-full shadow"
                        aria-hidden="true"
                      >
                        <Sprout className="text-forest-700 h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span className="text-forest-900 text-caption font-bold">{name}</span>
                    {place ? <span className="text-fg-muted text-meta">{place}</span> : null}
                  </Link>
                </li>
              );
            })
          : list.map((d, i) => (
              <li
                key={d}
                className="border-border bg-surface-raised flex flex-col items-center gap-3 rounded-2xl border p-5 text-center"
              >
                <span
                  className={`${AVATAR[i % AVATAR.length]} grid h-16 w-16 place-items-center rounded-full text-white`}
                  aria-hidden="true"
                >
                  <MapPin className="h-7 w-7" />
                </span>
                <span className="text-forest-900 text-caption font-bold">{d}</span>
                <span className="text-fg-muted text-meta">{copy.role}</span>
              </li>
            ))}
      </ul>
    </Section>
  );
}
