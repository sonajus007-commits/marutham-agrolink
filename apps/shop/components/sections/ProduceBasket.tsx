import { homepagePrice, fmtMoney, type Product } from '@marutham/lib';
import type { Dict } from '@/lib/dict';
import { produceImage } from '@/lib/produceImage';

/* The hero's right column in the approved model: a cluster of real produce
 * photos, overlapping in white rings on the green panel — the "basket". Each
 * tile is a real available product with a real photo (produceImage); the front
 * tile carries its live price so the hero still says something true. If the
 * catalogue has fewer than three photographed products the cluster simply shows
 * what it has. */
export function ProduceBasket({ products, t }: { products: Product[]; t: Dict }) {
  const seen = new Set<string>();
  const picks: { p: Product; img: string }[] = [];
  for (const p of products) {
    const img = produceImage(p.name, p.regional_name);
    if (img && !seen.has(img)) {
      seen.add(img);
      picks.push({ p, img });
    }
    if (picks.length === 3) break;
  }
  if (picks.length === 0) return null;

  // Sizes + offsets for the three-tile fan; front tile last so it sits on top.
  const frame = [
    'h-40 w-40 lg:h-52 lg:w-52',
    'h-32 w-32 lg:h-40 lg:w-40',
    'h-36 w-36 lg:h-44 lg:w-44',
  ];
  const place = [
    'left-2 top-6 lg:left-0',
    'right-4 top-0 lg:right-6',
    'right-10 bottom-0 lg:right-20',
  ];

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
      {/* Soft halo behind the cluster. */}
      <div className="absolute inset-6 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
      {picks.map(({ p, img }, i) => {
        const price = i === picks.length - 1 ? homepagePrice(p) : null;
        return (
          <div
            key={String(p.id)}
            className={`absolute ${place[i]} ${frame[i]} overflow-hidden rounded-full border-4 border-white/85 shadow-[0_24px_50px_-16px_rgba(0,0,0,0.55)]`}
          >
            <img src={img} alt={p.name} className="h-full w-full object-cover" />
            {price ? (
              <span className="absolute right-2 bottom-2 rounded-full bg-white/95 px-2.5 py-1 text-caption font-bold text-forest-900 shadow-md">
                {fmtMoney(price.amount)}
                <span className="text-fg-muted font-medium">/{price.unit}</span>
              </span>
            ) : null}
          </div>
        );
      })}
      {/* Honest "fresh today" pill, echoing the model. Bottom-left, clear of the
          front tile's price chip. */}
      <span className="absolute bottom-4 left-0 rounded-full border border-white/25 bg-white/12 px-4 py-1.5 text-caption font-semibold whitespace-nowrap text-white backdrop-blur-sm">
        <span
          className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#7ed492] align-middle"
          aria-hidden="true"
        />
        {t.fresh.badge}
      </span>
    </div>
  );
}
