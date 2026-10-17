import { LocaleLink as Link } from '@/components/LocaleLink';
import type { Product } from '@marutham/lib';
import type { Dict } from '@/lib/dict';
import { Section, SectionHeader } from '@/components/ui/Section';
import { ProductCard } from '@/components/ProductCard';
import { produceImage } from '@/lib/produceImage';
import { ScrollRow } from '@/components/ui/ScrollRow';

/* Fresh Today — a swipeable shelf of real available produce. It reuses the same
 * ProductCard the /products catalogue uses, so the home page and the catalogue
 * never drift apart.
 *
 * It used to auto-scroll (a CSS marquee). On a phone there is no hover to pause
 * it, so "+ Add" was a moving target; now the shopper moves the shelf — swipe on
 * touch, arrows on desktop (see ui/ScrollRow). Cards snap so none stops half-cut,
 * and on mobile the next card peeks in to show there is more.
 *
 * Selection is photo-first (distinct photos to the front) so the shelf looks its
 * best; never invented — an empty catalogue renders nothing. */

const LIMIT = 10;
const CARD = 'w-[42%] shrink-0 snap-start sm:w-60';

export function FreshToday({ products, t }: { products: Product[]; t: Dict }) {
  const withPhoto: Product[] = [];
  const noPhoto: Product[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const img = produceImage(p.name, p.regional_name);
    if (img && !seen.has(img)) {
      seen.add(img);
      withPhoto.push(p);
    } else if (!img) {
      noPhoto.push(p);
    }
  }
  const dupPhoto = products.filter((p) => !withPhoto.includes(p) && !noPhoto.includes(p));
  const picks = [...withPhoto, ...noPhoto, ...dupPhoto].slice(0, LIMIT);

  if (picks.length === 0) return null;

  return (
    <Section id="fresh-today" tone="bg" aria-labelledby="fresh-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader id="fresh-h" eyebrow={t.fresh.badge} accent="leaf" title={t.fresh.title} />
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 inline-flex min-h-11 shrink-0 items-center text-caption font-semibold no-underline"
        >
          {t.fresh.viewAll}
        </Link>
      </div>

      <div className="mt-10">
        <ScrollRow
          label={t.fresh.title}
          prevLabel={t.htmlLang === 'ta' ? 'முந்தையவை' : 'Previous products'}
          nextLabel={t.htmlLang === 'ta' ? 'அடுத்தவை' : 'More products'}
        >
          {picks.map((p) => (
            <ProductCard key={String(p.id)} t={t} product={p} className={CARD} />
          ))}
        </ScrollRow>
      </div>
    </Section>
  );
}
