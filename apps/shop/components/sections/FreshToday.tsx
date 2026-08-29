import Link from 'next/link';
import type { Product } from '@marutham/lib';
import type { Dict } from '@/lib/dict';
import { Section, SectionHeader } from '@/components/ui/Section';
import { ProductCard } from '@/components/ProductCard';
import { produceImage } from '@/lib/produceImage';

/* Fresh Today — a slow, continuously moving carousel of real available produce,
 * so the shelf feels alive and a shopper's eye is drawn to a few items at a time
 * (the ask). It reuses the same ProductCard the /products catalogue uses, so the
 * home page and the catalogue never drift apart.
 *
 * Structure: two identical <ul> rows sit side by side inside the moving track.
 * Each card carries a trailing margin (mr-4) rather than a container gap, so each
 * row's width is exact and translateX(-50%) (see .ma-marquee in globals.css)
 * lands precisely on the start of the second row — the loop is seamless. The
 * second row is inert + aria-hidden, so a keyboard user never tabs into a
 * duplicate and a screen reader hears each product once. It pauses on hover and
 * stops entirely under prefers-reduced-motion (then it simply reads as a row of
 * cards that can be scrolled).
 *
 * Selection is photo-first (distinct photos to the front) so the moving row looks
 * its best; never invented — an empty catalogue renders nothing. */

const LIMIT = 10;
const CARD = 'w-60 shrink-0 mr-4';

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

  const row = (hidden: boolean) => (
    <ul
      className="flex list-none p-0"
      aria-hidden={hidden || undefined}
      {...(hidden ? { inert: true } : {})}
    >
      {picks.map((p) => (
        <ProductCard key={String(p.id)} t={t} product={p} className={CARD} />
      ))}
    </ul>
  );

  return (
    <Section id="fresh-today" tone="bg" aria-labelledby="fresh-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader id="fresh-h" eyebrow={t.fresh.badge} accent="leaf" title={t.fresh.title} />
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 shrink-0 text-caption font-semibold no-underline"
        >
          {t.fresh.viewAll}
        </Link>
      </div>

      {/* The moving shelf. Edges fade so cards enter and leave softly. */}
      <div
        className="relative mt-10 overflow-hidden py-1"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)',
        }}
      >
        <div className="ma-marquee flex w-max">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </Section>
  );
}
