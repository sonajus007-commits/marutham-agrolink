import Link from 'next/link';
import { homepagePrice, productEmoji, fmtMoney, type Product } from '@marutham/lib';
import type { Dict } from '@/lib/dict';
import type { LandingCopy } from '@/lib/landing';
import { produceImage } from '@/lib/produceImage';

/* The hero's right column: an informative "fresh today" card, in place of the
 * old logo medallion. It shows REAL available produce — photo where we have one
 * (public/produce, via produceImage), the product emoji otherwise — with the
 * live price the catalogue actually carries. Below it, the three steps a buyer
 * takes. This turns the hero from a picture into something a visitor can read
 * and act on.
 *
 * Everything here is true: if the API is empty the card says so honestly rather
 * than inventing produce. Products that have a photo are floated to the front so
 * the card looks its best, but only real listings ever appear. */

export function FreshPicks({ products, t, c }: { products: Product[]; t: Dict; c: LandingCopy }) {
  /* Choose four for the best-looking, varied card — always real listings.
   *   1. one product per DISTINCT photo (so no two tiles share an image),
   *   2. then products with no photo (they render their emoji),
   *   3. then, only if still short, a product whose photo already appeared.
   * With a normal catalogue this yields four different photos. */
  const distinct: Product[] = [];
  const noImage: Product[] = [];
  const dupImage: Product[] = [];
  const seen = new Set<string>();
  for (const p of products) {
    const img = produceImage(p.name, p.regional_name);
    if (!img) noImage.push(p);
    else if (!seen.has(img)) {
      seen.add(img);
      distinct.push(p);
    } else dupImage.push(p);
  }
  const picks = [...distinct, ...noImage, ...dupImage].slice(0, 4);
  const steps = c.consumer.steps.slice(0, 3);

  return (
    <div className="border-border/70 bg-surface-raised relative rounded-[1.75rem] border p-5 shadow-[0_30px_70px_rgba(22,61,47,0.16)]">
      <div className="flex items-center justify-between">
        <h2 className="text-forest-900 text-card font-bold">{t.fresh.title}</h2>
        <span className="text-leaf-ink inline-flex items-center gap-1.5 text-caption font-bold">
          <span
            className="h-2 w-2 rounded-full bg-[#2e7d4f] shadow-[0_0_0_3px_rgba(46,125,79,0.2)]"
            aria-hidden="true"
          />
          {t.fresh.badge}
        </span>
      </div>

      {picks.length > 0 ? (
        <ul className="mt-4 grid list-none grid-cols-2 gap-3 p-0">
          {picks.map((p) => {
            const price = homepagePrice(p);
            const img = produceImage(p.name, p.regional_name);
            return (
              <li key={String(p.id)}>
                <Link
                  href={`/products/${p.id}`}
                  className="border-border/70 group block overflow-hidden rounded-2xl border bg-white no-underline transition-shadow hover:shadow-md"
                >
                  <div className="bg-mist relative h-24 w-full overflow-hidden">
                    {img ? (
                      <img
                        src={img}
                        alt={p.name}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <span
                        className="flex h-full w-full items-center justify-center text-4xl"
                        aria-hidden="true"
                      >
                        {productEmoji(p.name)}
                      </span>
                    )}
                  </div>
                  <div className="px-3 py-2.5">
                    <p className="text-forest-900 truncate text-caption font-semibold">{p.name}</p>
                    <p className="text-blossom-ink mt-0.5 text-caption font-bold">
                      {price ? (
                        <>
                          {fmtMoney(price.amount)}
                          <span className="text-fg-muted font-medium">/{price.unit}</span>
                        </>
                      ) : (
                        <span className="text-fg-muted font-medium">{t.fresh.unavailable}</span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-fg-muted border-border/70 mt-4 rounded-2xl border border-dashed px-4 py-8 text-center text-caption">
          {t.fresh.empty}
        </p>
      )}

      {/* Three steps — the consumer flow, in the reader's language. */}
      <ol className="mt-4 grid list-none grid-cols-3 gap-2 p-0">
        {steps.map((s, i) => (
          <li
            key={s.t}
            className="border-border/70 flex flex-col items-center gap-1.5 rounded-xl border border-dashed px-2 py-3 text-center"
          >
            <span className="bg-bg text-forest-700 inline-grid h-6 w-6 place-items-center rounded-full text-[0.7rem] font-bold">
              {i + 1}
            </span>
            <span className="text-fg-muted text-[0.7rem] leading-tight">{s.t}</span>
          </li>
        ))}
      </ol>

      <Link
        href="/products"
        className="text-forest-700 hover:text-forest-900 mt-4 inline-flex text-caption font-semibold no-underline"
      >
        {t.fresh.viewAll}
      </Link>
    </div>
  );
}
