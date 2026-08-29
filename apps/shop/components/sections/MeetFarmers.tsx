import Link from 'next/link';
import { Sprout } from 'lucide-react';
import type { Product } from '@marutham/lib';
import type { Lang } from '@/lib/dict';
import { Section, SectionHeader } from '@/components/ui/Section';

/* Meet Our Farmers — the model's farmer row, kept HONEST. The public product
 * API anonymises growers (district only, never a name — backend/utils/
 * publicShape.js), so we cannot show real farmer names or faces yet. Rather than
 * invent people, this shows the real DISTRICTS the live catalogue is sourced
 * from, as monogram tiles, with a plain note that named profiles arrive with the
 * farmer directory (P3). Every district shown is one that actually has produce
 * listed right now. */

const AVATAR = ['bg-forest-700', 'bg-blossom-500', 'bg-water-500', 'bg-earth-500'];

function tidy(d: string): string {
  return d.replace(/\s+district$/i, '').trim();
}

export function MeetFarmers({ products, lang }: { products: Product[]; lang: Lang }) {
  const districts = new Set<string>();
  for (const p of products) {
    for (const dp of p.product_district_prices ?? []) {
      const d = dp.district ? tidy(dp.district) : '';
      if (d) districts.add(d);
    }
  }
  const list = [...districts].sort((a, b) => a.localeCompare(b)).slice(0, 6);
  if (list.length === 0) return null;

  const copy =
    lang === 'ta'
      ? {
          eyebrow: 'எங்கள் விவசாயிகள்',
          title: 'விளைவித்தவரை அறியுங்கள்',
          lede: 'நாங்கள் வாங்கும் மாவட்டங்களில் உள்ள சரிபார்க்கப்பட்ட விவசாயிகள். பெயருடன் கூடிய விவரங்கள் விரைவில்.',
          role: 'சரிபார்க்கப்பட்ட விவசாயிகள்',
          cta: 'அவர்களின் விளைபொருட்களை வாங்குங்கள் →',
        }
      : {
          eyebrow: 'Our farmers',
          title: 'Meet the growers behind your food',
          lede: 'Verified farmers in the districts we source from. Named profiles arrive with the farmer directory.',
          role: 'Verified growers',
          cta: 'Shop their produce →',
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
          href="/products"
          className="text-forest-700 hover:text-forest-900 shrink-0 text-caption font-semibold no-underline"
        >
          {copy.cta}
        </Link>
      </div>

      <ul className="mt-12 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-6">
        {list.map((d, i) => (
          <li
            key={d}
            className="border-border bg-surface-raised flex flex-col items-center gap-3 rounded-2xl border p-5 text-center"
          >
            <span
              className={`${AVATAR[i % AVATAR.length]} relative grid h-16 w-16 place-items-center rounded-full text-xl font-bold text-white`}
            >
              {d.slice(0, 1).toUpperCase()}
              <span
                className="bg-surface absolute -right-1 -bottom-1 grid h-6 w-6 place-items-center rounded-full shadow"
                aria-hidden="true"
              >
                <Sprout className="text-forest-700 h-3.5 w-3.5" />
              </span>
            </span>
            <span className="text-forest-900 text-caption font-bold">{d}</span>
            <span className="text-fg-muted text-[0.7rem]">{copy.role}</span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
