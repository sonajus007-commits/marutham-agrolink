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
