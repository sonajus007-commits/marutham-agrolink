import { LocaleLink as Link } from '@/components/LocaleLink';
import type { Product } from '@marutham/lib';
import { categorySlug } from '@/lib/categorySlug';
import type { Dict } from '@/lib/dict';
import { Section, SectionHeader } from '@/components/ui/Section';
import { ProduceIcon } from '@/components/ui/ProduceIcon';

/* Shop by Category — the circular rail from the reference model, but every chip
 * is a category the catalogue ACTUALLY carries right now. We read the distinct
 * `category` values off the live products, count them, and order them by a
 * canonical retail sequence (produce first, pantry last) so the rail is stable
 * across restocks rather than jumping around with inventory. A category with no
 * products simply never appears — nothing here is invented. Each chip deep-links
 * to the filtered catalogue (`/products?category=`), which the shop page reads. */

/* Canonical retail order; anything not listed falls to the end, alphabetical. */
const ORDER = [
  'veget',
  'fruit',
  'poultry',
  'meat',
  'seafood',
  'milk',
  'egg',
  'grain',
  'organic',
  'season',
  'can',
];
function rank(name: string): number {
  const hay = name.toLowerCase();
  const i = ORDER.findIndex((k) => hay.includes(k));
  return i === -1 ? ORDER.length : i;
}

export function CategoryRail({ products, t }: { products: Product[]; t: Dict }) {
  const counts = new Map<string, number>();
  for (const p of products) {
    const cat = p.category?.trim();
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const cats = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));

  if (cats.length === 0) return null;

  return (
    <Section id="categories" tone="surface" aria-labelledby="cat-h" className="pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          id="cat-h"
          eyebrow={t.categories.title}
          accent="blossom"
          title={t.categories.title}
          lede={t.categories.sub}
        />
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 inline-flex min-h-11 shrink-0 items-center text-caption font-semibold no-underline"
        >
          {t.categories.all} →
        </Link>
      </div>

      <ul className="mt-10 grid list-none grid-cols-3 gap-x-4 gap-y-7 p-0 sm:grid-cols-5 lg:grid-cols-9">
        {cats.map((cat, i) => (
          /* A plain li, not a per-item Reveal: staggered fades left the whole rail
             blank mid-scroll in real Chrome. Shopping content paints at once; only
             the section header keeps its entrance. */
          <li key={cat.name}>
            <Link
              href={`/category/${categorySlug(cat.name)}`}
              className="group flex flex-col items-center gap-2 text-center no-underline"
              aria-label={`${cat.name} — ${t.categories.count(cat.count)}`}
            >
              <span
                className={`${i % 2 === 0 ? 'bg-blossom-500/12 text-blossom-ink' : 'bg-mist text-forest-700'} border-border/60 grid h-16 w-16 place-items-center rounded-full border transition-transform duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_12px_28px_rgba(22,61,47,0.14)]`}
                aria-hidden="true"
              >
                <ProduceIcon category={cat.name} className="h-7 w-7" />
              </span>
              <span className="text-forest-900 text-caption leading-tight font-semibold">
                {cat.name}
              </span>
              <span className="text-fg-muted text-meta">{t.categories.count(cat.count)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
