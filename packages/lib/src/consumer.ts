/* Consumer storefront domain — pricing, quantity rules, and the cart bill engine.
 * Ported verbatim in logic from frontend/consumer.html so charges match exactly.
 * Pure + framework-agnostic → testable and reusable by a future React Native app. */

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
  district_price?: DistrictPrice | null;
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

export const FREE_DELIVERY_MIN = 150; // ₹ — free delivery at/above this item total
export const DELIVERY_FLAT = 25; // ₹ — charged below the threshold

const PRODUCT_EMOJI: Record<string, string> = {
  Tomatoes: '🍅', Brinjal: '🍆', 'Green Chilli': '🌶️', Onion: '🧅', Potato: '🥔',
  Carrot: '🥕', Banana: '🍌', Mango: '🥭', Guava: '🍐', 'Raw Rice': '🌾',
  'Toor Dal': '🫘', 'Country Chicken': '🐓', 'Broiler Chicken': '🍗', 'Goat Mutton': '🍖',
  Catfish: '🐟', Prawn: '🦐', 'Fresh Milk': '🥛', Curd: '🥣',
  'Coriander Leaves': '🌿', 'Curry Leaves': '🍃',
};
const DECIMAL_UNITS: Record<string, boolean> = { kg: true, g: true, litre: true, ml: true, quintal: true, ton: true };

export function getProductEmoji(name: string): string {
  return PRODUCT_EMOJI[name] || '🌿';
}
export function unitAllowsDecimal(u?: string): boolean {
  return !!(u && DECIMAL_UNITS[u]);
}
export function unitStep(u?: string): number {
  return unitAllowsDecimal(u) ? 0.5 : 1;
}

/** Consumer price (rupees) for an offer: seller-aware price + handling. */
export function offerConsumerPrice(offer: Offer, product: Product): number {
  const dp = product.district_price;
  const handling = dp ? parseFloat(String(dp.handling)) || 0 : 0;
  const feePct = product.platform_fee_pct || 5;
  const farmerPrice = parseFloat(String(offer.farmer_price));
  const base = offer.consumer_price != null ? offer.consumer_price / 100 : farmerPrice * (1 + feePct / 100);
  return base + handling;
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
    if (search) return (p.name || '').toLowerCase().includes(search);
    if (f.group !== 'All' && p.product_group !== f.group) return false;
    if (f.cat !== 'All' && p.category !== f.cat) return false;
    if (f.sub !== 'All' && p.sub_type !== f.sub) return false;
    const offers = offersByProduct[p.id] || [];
    if (f.seller === 'Farmer' && offersForSeller(offers, 'Farmer').length === 0) return false;
    if (f.seller === 'Retailer' && offersForSeller(offers, 'Retailer').length === 0) return false;
    if (city && offers.filter((o) => (o.farmer?.village_town || '').toLowerCase().includes(city)).length === 0)
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

/** The order bill. Ported verbatim from consumer.html cartBill(). */
export function cartBill(cart: CartItem[], productById: Record<string, Product>): CartBill {
  const prodOf = (i: CartItem) => productById[i.product_id] || ({} as Product);
  const hdlOf = (i: CartItem) => {
    const dp = prodOf(i).district_price;
    return dp ? parseFloat(String(dp.handling)) || 0 : 0;
  };
  const itemSubtotal = cart.reduce((s, i) => s + Math.max(0, parseFloat(String(i.price || 0)) - hdlOf(i)) * i.qty, 0);
  const handling = cart.reduce((mx, i) => (prodOf(i).exotic ? Math.max(mx, hdlOf(i)) : mx), 0);
  const farmers: Record<string, 1> = {};
  cart.forEach((i) => { if (i.farmer_id) farmers[i.farmer_id] = 1; });
  const marketFee = Object.keys(farmers).length >= 2 ? 10 : 0;
  const delivery = itemSubtotal <= 0 ? 0 : itemSubtotal >= FREE_DELIVERY_MIN ? 0 : DELIVERY_FLAT;
  const savings = cart.reduce((s, i) => {
    const dp = prodOf(i).district_price;
    if (!dp) return s;
    const paidNoHdl = parseFloat(String(i.price)) - hdlOf(i);
    return s + Math.max(0, parseFloat(String(dp.market_price)) - paidNoHdl) * i.qty;
  }, 0);
  return { itemSubtotal, handling, marketFee, delivery, savings, total: itemSubtotal + handling + marketFee + delivery };
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
