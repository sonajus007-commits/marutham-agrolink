/* Public marketplace (apps/shop) — the pure bits of the storefront.
 *
 * Ported from frontend/home.html, which computed these inline in a <script>.
 * They live here because the shop server-renders: the homepage is a React
 * Server Component, and anything it can compute without the DOM belongs in a
 * tested module rather than in JSX. */
import type { Product } from './consumer';

/** The district whose shelf price the public homepage quotes. */
export const HOME_DISTRICT = 'Pudukkottai';

/** A row of `product_district_prices` — the un-collapsed shape, WITH its district.
 *  Distinct from consumer.ts's DistrictPrice, which is the single collapsed price
 *  the API returns when you filter by district and therefore has no `district`. */
export interface ProductDistrictPrice {
  district?: string | null;
  market_price?: string | number | null;
  handling?: string | number | null;
}

/**
 * The price to show a visitor who has not told us where they are.
 *
 * Prefers the home district and falls back to whatever the product carries, so
 * a product priced only elsewhere still shows a number rather than a dash.
 * Returns null when there is no price at all — the caller decides what a
 * priceless product looks like.
 *
 * `market_price` IS a money-middleware field, so it arrives as a RUPEE string
 * (not paise) — no ÷100 here. See backend/utils/money.js.
 */
export function homepagePrice(
  product: Pick<Product, 'unit'> & { product_district_prices?: ProductDistrictPrice[] | null },
  district: string = HOME_DISTRICT,
): { amount: number; unit: string } | null {
  const prices = product.product_district_prices || [];
  if (!prices.length) return null;

  const wanted = district.toLowerCase();
  const row =
    prices.find((p) => (p.district || '').toLowerCase().includes(wanted)) || prices[0];

  const amount = Number(row?.market_price ?? NaN);
  if (!row || !Number.isFinite(amount) || amount <= 0) return null;

  return { amount, unit: (product.unit as string) || 'unit' };
}

/* A picture per product without an image pipeline. The catalogue is produce, so
 * an emoji reads instantly and costs nothing to serve — and a missing photo is
 * far more common than a wrong emoji. Matched on a substring of the name, in
 * order, so "Green Chilli" hits chilli before the generic fallback. */
const EMOJI: ReadonlyArray<readonly [string, string]> = [
  ['tomato', '🍅'], ['potato', '🥔'], ['onion', '🧅'], ['carrot', '🥕'],
  ['brinjal', '🍆'], ['eggplant', '🍆'], ['chilli', '🌶️'], ['chili', '🌶️'],
  ['banana', '🍌'], ['mango', '🥭'], ['grape', '🍇'], ['apple', '🍎'],
  ['coconut', '🥥'], ['lemon', '🍋'], ['corn', '🌽'], ['cucumber', '🥒'],
  ['garlic', '🧄'], ['pumpkin', '🎃'], ['leaf', '🥬'], ['spinach', '🥬'],
  ['cabbage', '🥬'], ['beet', '🫜'], ['pea', '🫛'], ['bean', '🫘'],
  ['rice', '🍚'], ['milk', '🥛'], ['egg', '🥚'], ['honey', '🍯'],
  ['groundnut', '🥜'], ['peanut', '🥜'], ['mushroom', '🍄'], ['pepper', '🫑'],
];

export function productEmoji(name?: string | null): string {
  const lower = (name || '').toLowerCase();
  for (const [key, emoji] of EMOJI) {
    if (lower.includes(key)) return emoji;
  }
  return '🌿';
}

/** How many products the homepage shows before "View all". */
export const HOME_PRODUCT_LIMIT = 10;

/* ── Product detail page ──────────────────────────────────────────────────────
 *
 * A live offer as an ANONYMOUS caller sees it. The grower is a DISTRICT and
 * nothing else: `GET /products/:id` runs through backend/utils/publicShape.js,
 * which is an allow-list, so `farmer` carries no name, village, phone or id.
 *
 * That is enforced by the API, not here — but this type is deliberately narrow
 * so a page cannot render a field the public endpoint does not send, and so
 * anyone widening it has to go and widen the server's allow-list first.
 */
export interface PublicListing {
  id?: string;
  farmer_price?: string | number | null;
  qty_available?: number | null;
  time_available?: string | null;
  bulk_qty?: number | null;
  bulk_disc_pct?: string | number | null;
  /** District only. Never a name. */
  farmer?: { district?: string | null } | null;
  farmer_avg_rating?: string | number | null;
}

/** An offer's asking price in RUPEES, or null when it has none.
 *  `farmer_price` is a money-middleware field → a rupee STRING, never paise. */
export function offerPrice(listing: PublicListing): number | null {
  const n = Number(listing.farmer_price ?? NaN);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Is this offer actually buyable? A listing with nothing left is not an offer. */
export function offerInStock(listing: PublicListing): boolean {
  const qty = Number(listing.qty_available ?? 0);
  return offerPrice(listing) !== null && Number.isFinite(qty) && qty > 0;
}

/**
 * The offers worth showing, cheapest first.
 *
 * Sold-out and priceless rows are dropped rather than rendered greyed-out: this
 * is a shop window for someone who has not signed in, and a row they cannot buy
 * is only a reason to leave. Ties break on the larger quantity, so the offer
 * most likely to survive to checkout sorts first.
 */
export function sortedOffers(listings: PublicListing[] | null | undefined): PublicListing[] {
  return (listings || [])
    .filter(offerInStock)
    .sort((a, b) => {
      const byPrice = (offerPrice(a) as number) - (offerPrice(b) as number);
      if (byPrice !== 0) return byPrice;
      return Number(b.qty_available ?? 0) - Number(a.qty_available ?? 0);
    });
}

/** Every district this product is priced in, alphabetical, priceless rows dropped. */
export function districtPriceRows(
  product: Partial<Pick<Product, 'product_district_prices'>>,
): Array<{ district: string; amount: number }> {
  return (product.product_district_prices || [])
    .map((row) => ({
      district: (row.district || '').trim(),
      amount: Number(row.market_price ?? NaN),
    }))
    .filter((row) => row.district && Number.isFinite(row.amount) && row.amount > 0)
    .sort((a, b) => a.district.localeCompare(b.district));
}

/**
 * schema.org Product JSON-LD — the payload that makes server-rendering this page
 * pay for itself. It is what puts a price, a rating and an in-stock flag into a
 * Google result; the SPA at /app could never produce it, because a crawler gets
 * an empty <div> there.
 *
 * Emitted only with a real price: a bogus `price: 0` is worse than no rich
 * result at all, and Google penalises structured data that disagrees with the
 * page. Everything here must be visible on the page too — that is Google's rule,
 * and it is why availability tracks the same `sortedOffers` the markup renders.
 */
export function productJsonLd(args: {
  product: Pick<Product, 'name' | 'unit'> & { regional_name?: string; category?: string; avg_rating?: string | number };
  price: number | null;
  listings: PublicListing[] | null | undefined;
  url: string;
}): Record<string, unknown> | null {
  const { product, price, listings, url } = args;
  if (price === null) return null;

  const offers = sortedOffers(listings);
  const rating = Number(product.avg_rating ?? NaN);

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    ...(product.regional_name ? { alternateName: product.regional_name } : {}),
    ...(product.category ? { category: product.category } : {}),
    url,
    offers: {
      '@type': 'Offer',
      priceCurrency: 'INR',
      price: price.toFixed(2),
      availability: offers.length
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url,
    },
    ...(Number.isFinite(rating) && rating > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: rating.toFixed(1),
            bestRating: '5',
          },
        }
      : {}),
  };
}
