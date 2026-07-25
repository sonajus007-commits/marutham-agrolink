/* Consumer storefront domain — pricing, quantity rules, and the cart bill engine.
 * Ported verbatim in logic from frontend/consumer.html so charges match exactly.
 * Pure + framework-agnostic → testable and reusable by a future React Native app. */
import { sellerFeePct } from './fees';

export interface DistrictPrice {
  handling?: string | number;
  market_price?: string | number;
  consumer_price?: string | number;
}

export interface SellerRef {
  id?: string;
  fname?: string;
  lname?: string;
  seller_type?: 'Farmer' | 'Retailer' | string;
  village_town?: string;
  district?: string;
}

export interface Product {
  id: string;
  name: string;
  regional_name?: string;
  unit?: string;
  product_group?: string;
  category?: string;
  sub_type?: string;
  platform_fee_pct?: number;
  exotic?: boolean;
  /** The single price the API collapses to when you filter by district. */
  district_price?: DistrictPrice | null;
  /** Every district's price — what the API returns when you DON'T filter by one
   *  (the admin catalogue and the public marketplace both take this path).
   *  Declared because the index signature below would otherwise type it
   *  `unknown`, and every reader would have to cast it back. */
  product_district_prices?: Array<{
    district?: string | null;
    market_price?: string | number | null;
    handling?: string | number | null;
  }> | null;
  avg_rating?: string | number;
  [key: string]: unknown;
}

export interface Offer {
  id?: string;
  farmer_price: string | number;
  /** Seller-aware consumer price in PAISE (as the API returns it), or null. */
  consumer_price?: number | null;
  qty_available?: number;
  qty_type?: 'MOQ' | 'SPQ' | null;
  qty_value?: string | number;
  time_available?: string;
  bulk_qty?: number;
  bulk_disc_pct?: number;
  images?: string[];
  farmer?: SellerRef;
  farmer_id?: string;
  listed?: boolean;
  [key: string]: unknown;
}

export interface CartItem {
  product_id: string;
  product_name: string;
  unit?: string;
  price: number; // consumer price in rupees, handling included
  qty: number;
  farmer_id?: string | null;
  farmer_name?: string;
  listing_id?: string | null;
  farmer_price_rs?: number;
}

export interface Rating {
  avg_rating: number;
  num_ratings: number;
}

export const FREE_DELIVERY_MIN = 400; // ₹ — free delivery at/above this item total
export const DELIVERY_FLAT = 25; // ₹ — charged below the threshold

const PRODUCT_EMOJI: Record<string, string> = {
  Tomatoes: '🍅',
  Brinjal: '🍆',
  'Green Chilli': '🌶️',
  Onion: '🧅',
  Potato: '🥔',
  Carrot: '🥕',
  Banana: '🍌',
  Mango: '🥭',
  Guava: '🍐',
  'Raw Rice': '🌾',
  'Toor Dal': '🫘',
  'Country Chicken': '🐓',
  'Broiler Chicken': '🍗',
  'Goat Mutton': '🍖',
  Catfish: '🐟',
  Prawn: '🦐',
  'Fresh Milk': '🥛',
  Curd: '🥣',
  'Coriander Leaves': '🌿',
  'Curry Leaves': '🍃',
};
const DECIMAL_UNITS: Record<string, boolean> = {
  kg: true,
  g: true,
  litre: true,
  ml: true,
  quintal: true,
  ton: true,
};

export function getProductEmoji(name: string): string {
  return PRODUCT_EMOJI[name] || '🌿';
}
export function unitAllowsDecimal(u?: string): boolean {
  return !!(u && DECIMAL_UNITS[u]);
}
export function unitStep(u?: string): number {
  return unitAllowsDecimal(u) ? 0.5 : 1;
}

/**
 * What one unit of this offer costs the customer, in rupees.
 *
 * This is the ITEM price and nothing else. Handling is deliberately NOT folded in:
 * it is charged once per ORDER (the highest rate among the cart's exotic items), not
 * per unit, so burying it in a unit price made the shelf price a number that was
 * true of no actual purchase — and it did not survive to the order, because the
 * server stores the line at fee-adjusted price with no handling. The charge is shown
 * on its own line in the cart bill, where the customer can see what it is.
 *
 * The server sends `consumer_price` (paise), already fee-adjusted, and that is
 * authoritative. The fallback recomputes it from the SELLER's fee — not from
 * `product.platform_fee_pct`, which the server ignores entirely and which reads
 * 5% even for Retailers, who are charged 10%.
 */
export function offerConsumerPrice(offer: Offer): number {
  const farmerPrice = parseFloat(String(offer.farmer_price));
  return offer.consumer_price != null
    ? offer.consumer_price / 100
    : farmerPrice * (1 + sellerFeePct(offer.farmer?.seller_type) / 100);
}

/** Comparable price used to pick the cheapest offer (mirrors legacy exactly). */
function offerRank(o: Offer): number {
  return o.consumer_price != null ? o.consumer_price : parseFloat(String(o.farmer_price));
}

export type SellerFilter = 'All' | 'Farmer' | 'Retailer';

/** Offers narrowed to the active seller-type filter. */
export function offersForSeller(offers: Offer[], seller: SellerFilter): Offer[] {
  if (seller === 'Farmer') return offers.filter((o) => o.farmer?.seller_type === 'Farmer');
  if (seller === 'Retailer') return offers.filter((o) => o.farmer?.seller_type === 'Retailer');
  return offers;
}

/** Cheapest offer among the (seller-filtered) list, or null. */
export function bestOffer(offers: Offer[], seller: SellerFilter = 'All'): Offer | null {
  const relevant = offersForSeller(offers, seller);
  if (relevant.length === 0) return null;
  return relevant.reduce((best, o) => (offerRank(o) < offerRank(best) ? o : best));
}

/**
 * Offers for one product, ordered so the consumer can pick by rating: the
 * highest-rated seller first, unrated sellers last, cheaper offer breaking a tie.
 * Ratings are keyed by `${farmer_id}_${product_id}` in `ratingsByFP` (the same
 * map the offer rows read), so the seller behind each offer is looked up there.
 * Pure and non-mutating — returns a new array.
 */
export function offersByRating(
  offers: Offer[],
  ratingsByFP: Record<string, Rating>,
  productId: string,
): Offer[] {
  const ratingOf = (o: Offer): number => {
    const r = ratingsByFP[`${o.farmer?.id || o.farmer_id || ''}_${productId}`];
    return r && r.num_ratings > 0 ? r.avg_rating : -1; // unrated sinks below any rated seller
  };
  return [...offers].sort((a, b) => {
    const diff = ratingOf(b) - ratingOf(a);
    return diff !== 0 ? diff : offerRank(a) - offerRank(b);
  });
}

export interface ProductFilter {
  group: string;
  cat: string;
  sub: string;
  seller: SellerFilter;
  city: string;
  search: string;
}

/** Filter the catalog exactly as the legacy renderProducts() did. */
export function filterProducts(
  products: Product[],
  offersByProduct: Record<string, Offer[]>,
  f: ProductFilter,
): Product[] {
  const search = f.search.trim().toLowerCase();
  const city = f.city.trim().toLowerCase();
  return products.filter((p) => {
    // Only list a product a seller has actually confirmed for selling today.
    // offersByProduct is built from the confirmed + active listings feed, so an
    // empty list here means no farmer/retailer has this product live — hide it,
    // even under a search, so the browse page only ever shows orderable items.
    const offers = offersByProduct[p.id] || [];
    if (offers.length === 0) return false;
    if (search) return (p.name || '').toLowerCase().includes(search);
    if (f.group !== 'All' && p.product_group !== f.group) return false;
    if (f.cat !== 'All' && p.category !== f.cat) return false;
    if (f.sub !== 'All' && p.sub_type !== f.sub) return false;
    if (f.seller === 'Farmer' && offersForSeller(offers, 'Farmer').length === 0) return false;
    if (f.seller === 'Retailer' && offersForSeller(offers, 'Retailer').length === 0) return false;
    if (
      city &&
      offers.filter((o) => (o.farmer?.village_town || '').toLowerCase().includes(city)).length === 0
    )
      return false;
    return true;
  });
}

export interface CartBill {
  itemSubtotal: number;
  handling: number;
  marketFee: number;
  delivery: number;
  savings: number;
  total: number;
}

/**
 * The order bill: the item lines, then each charge on its own line.
 *
 * `i.price` is the ITEM price alone (see offerConsumerPrice), so the subtotal is a
 * plain sum — what the customer sees against each row is what those rows add up to.
 * It used to subtract handling back out of every line, because the price it was
 * given had handling baked into it; the two together meant the visible line totals
 * did not sum to the Item Total printed underneath them.
 */
export function cartBill(cart: CartItem[], productById: Record<string, Product>): CartBill {
  const prodOf = (i: CartItem) => productById[i.product_id] || ({} as Product);
  const hdlOf = (i: CartItem) => {
    const dp = prodOf(i).district_price;
    return dp ? parseFloat(String(dp.handling)) || 0 : 0;
  };
  const itemSubtotal = cart.reduce((s, i) => s + parseFloat(String(i.price || 0)) * i.qty, 0);
  // Charged ONCE for the whole order — the highest handling amount among the cart's
  // items. Any product the admin gave a handling amount carries it (no longer gated
  // on `exotic`). Not per line, not per unit. Mirrors POST /orders.
  const handling = cart.reduce((mx, i) => Math.max(mx, hdlOf(i)), 0);
  const farmers: Record<string, 1> = {};
  cart.forEach((i) => {
    if (i.farmer_id) farmers[i.farmer_id] = 1;
  });
  const marketFee = Object.keys(farmers).length >= 2 ? 10 : 0;
  const delivery = itemSubtotal <= 0 ? 0 : itemSubtotal >= FREE_DELIVERY_MIN ? 0 : DELIVERY_FLAT;
  // Savings compare like with like: the market rate for the goods against what the
  // customer pays for the goods. Handling is a service charge on the order, not part
  // of what the produce costs, so it does not belong on either side.
  const savings = cart.reduce((s, i) => {
    const dp = prodOf(i).district_price;
    if (!dp) return s;
    const paid = parseFloat(String(i.price));
    return s + Math.max(0, parseFloat(String(dp.market_price)) - paid) * i.qty;
  }, 0);
  return {
    itemSubtotal,
    handling,
    marketFee,
    delivery,
    savings,
    total: itemSubtotal + handling + marketFee + delivery,
  };
}

export interface OrderingWindowStatus {
  open: boolean;
  msg: string;
}

/* Ordering window. NOTE: the legacy app currently forces this OPEN for testing
 * (the time-gated logic is commented out in consumer.html). Preserved exactly to
 * avoid a behaviour change; re-enable time-gating here when the business does. */
export function orderingWindowStatus(): OrderingWindowStatus {
  return { open: true, msg: 'Ordering open (no time restriction)' };
}
