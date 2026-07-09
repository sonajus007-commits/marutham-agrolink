/* Farmer/seller domain: what a seller earns, what the customer pays, and when a
 * listing stops accepting orders. Pure and framework-agnostic, so the web
 * listing form and a future React Native app project the same numbers. */
import { sellerFeePct, type SellerType } from './fees';
import { isOrderActive, isOrderCancelled, type Order } from './orders';

/** The server clamps bulk discounts to this; the form should too. */
export const MAX_BULK_DISC_PCT = 90;

/* ── Price projection ─────────────────────────────────────────────────────── */

export interface PricePreview {
  /** What the seller receives, per unit. */
  farmerPrice: number;
  /** Platform fee applied, in rupees. */
  fee: number;
  /** District handling charge, in rupees (exotic items only). */
  handling: number;
  /** What the customer pays, per unit. */
  consumerPrice: number;
  feePct: number;
}

/**
 * Project a seller's asking price into the customer's price.
 * `consumerPrice = farmerPrice × (1 + fee%) + handling`
 */
export function projectConsumerPrice(
  farmerPrice: number,
  sellerType: SellerType | null | undefined,
  handling = 0,
): PricePreview {
  const feePct = sellerFeePct(sellerType);
  const fee = farmerPrice * (feePct / 100);
  return { farmerPrice, feePct, fee, handling, consumerPrice: farmerPrice + fee + handling };
}

/** The same projection at a bulk discount. Returns null when no bulk rule is set. */
export function projectBulkPrice(
  farmerPrice: number,
  sellerType: SellerType | null | undefined,
  bulkQty: number | null | undefined,
  bulkDiscPct: number | null | undefined,
  handling = 0,
): (PricePreview & { bulkQty: number; discPct: number }) | null {
  if (!bulkQty || bulkQty <= 0 || !bulkDiscPct || bulkDiscPct <= 0) return null;
  const discPct = Math.min(bulkDiscPct, MAX_BULK_DISC_PCT);
  const discounted = farmerPrice * (1 - discPct / 100);
  return { ...projectConsumerPrice(discounted, sellerType, handling), bulkQty, discPct };
}

/* ── Listing cutoff ────────────────────────────────────────────────────────
 * The legacy page parsed labels like "8 PM (previous evening)" back into a
 * timestamp with string surgery. Keep the labels for display, but derive the
 * hour from a table rather than by re-parsing prose. */

export interface CutoffOption {
  /** Stored verbatim in farmer_listings.time_available. */
  label: string;
  /** 24-hour clock. */
  hour: number;
}

export const CUTOFF_OPTIONS: readonly CutoffOption[] = [
  { label: '6 AM', hour: 6 },
  { label: '8 AM', hour: 8 },
  { label: '10 AM', hour: 10 },
  { label: '12 PM (noon)', hour: 12 },
  { label: '2 PM', hour: 14 },
  { label: '4 PM', hour: 16 },
  { label: '6 PM', hour: 18 },
  { label: '8 PM (previous evening)', hour: 20 },
  { label: '10 PM', hour: 22 },
  { label: '12 AM (midnight)', hour: 0 },
];

/**
 * Absolute timestamp for a cutoff label: the next occurrence of that hour.
 * If the hour has already passed today, it rolls to tomorrow.
 */
export function cutoffTimestamp(label: string, now: Date = new Date()): string | null {
  const opt = CUTOFF_OPTIONS.find((o) => o.label === label);
  if (!opt) return null;
  const d = new Date(now);
  d.setHours(opt.hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/* ── Listing validation ────────────────────────────────────────────────────
 * The server re-checks everything; this only decides what to tell the seller
 * before a pointless round trip. */

export interface ListingDraft {
  product_id: string;
  /** Rupees, as typed. Converted to paise at the API boundary. */
  farmer_price: number | '';
  qty_available: number | '';
  time_available: string;
  bulk_qty?: number | '';
  bulk_disc_pct?: number | '';
  qty_type?: 'MOQ' | 'SPQ' | '';
  qty_value?: number | '';
}

/** First problem with the draft, or null. */
export function validateListing(d: ListingDraft): string | null {
  if (!d.product_id) return 'Select a product.';
  const price = Number(d.farmer_price);
  if (!(price > 0)) return 'Enter your selling price.';
  const qty = Number(d.qty_available);
  if (!(qty > 0)) return 'Enter the quantity you have available.';
  if (!cutoffTimestamp(d.time_available)) return 'Choose when orders should stop.';

  const bulkQty = Number(d.bulk_qty || 0);
  const bulkDisc = Number(d.bulk_disc_pct || 0);
  if ((bulkQty > 0) !== (bulkDisc > 0)) return 'A bulk offer needs both a quantity and a discount.';
  if (bulkDisc > MAX_BULK_DISC_PCT) return `Bulk discount cannot exceed ${MAX_BULK_DISC_PCT}%.`;
  if (bulkQty > 0 && bulkQty > qty) return 'The bulk quantity is more than you have available.';

  const qtyValue = Number(d.qty_value || 0);
  if (qtyValue > 0 && !d.qty_type) return 'Choose whether that is a minimum order or a pack size.';
  if (qtyValue > 0 && qtyValue > qty) return 'The order rule is larger than the quantity available.';

  return null;
}

/* ── Earnings ──────────────────────────────────────────────────────────────
 * Money arrives from the API as rupee strings (backend/utils/money.js), so
 * coerce before adding. `farmer_payout` is computed per order by GET /orders;
 * it is not a column, and the legacy screen summed it before it existed, which
 * is why "awaiting" and "in flight" were permanently ₹0. */

const rs = (v: unknown): number => parseFloat(String(v ?? 0)) || 0;

export type PayoutStatus = 'pending' | 'paid' | (string & {});

export interface Payout {
  id: string;
  amount: string | number;
  status: PayoutStatus;
  method?: string | null;
  reference?: string | null;
  created_at?: string;
  paid_at?: string | null;
  order?: { id: string; code?: string } | null;
}

export interface FarmerEarnings {
  /** Settled and paid out. */
  paid: number;
  /** Payout raised, not yet transferred. */
  pending: number;
  /** Delivered, but no payout record exists yet. */
  awaiting: number;
  /** Orders still in flight — not yet earned. */
  inFlight: number;
  /** paid + pending + awaiting. Excludes in-flight, which may still be cancelled. */
  lifetime: number;
}

/**
 * Split a seller's money across the settlement pipeline.
 * An order counts once: a payout record supersedes the "awaiting" bucket.
 */
export function farmerEarnings(orders: Order[], payouts: Payout[]): FarmerEarnings {
  const paid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + rs(p.amount), 0);
  const pending = payouts.filter((p) => p.status === 'pending').reduce((s, p) => s + rs(p.amount), 0);

  const settledOrderIds = new Set(payouts.map((p) => p.order?.id).filter(Boolean));

  const awaiting = orders
    .filter((o) => o.status === 'Delivered' && !isOrderCancelled(o) && !settledOrderIds.has(o.id))
    .reduce((s, o) => s + rs(o.farmer_payout), 0);

  const inFlight = orders.filter(isOrderActive).reduce((s, o) => s + rs(o.farmer_payout), 0);

  return { paid, pending, awaiting, inFlight, lifetime: paid + pending + awaiting };
}

/* ── Subscription ─────────────────────────────────────────────────────────── */

export type SubscriptionLevel = 'none' | 'active' | 'expiring' | 'expired';

export interface SubscriptionStatus {
  level: SubscriptionLevel;
  plan: string | null;
  expiresAt: string | null;
  /** Whole days remaining; negative once expired, null when there is no plan. */
  daysLeft: number | null;
}

/** Warn this many days before expiry — matches the server's reminder schedule. */
export const SUBSCRIPTION_WARN_DAYS = 10;

const MS_PER_DAY = 86_400_000;

export function subscriptionStatus(
  user: { subscription_plan?: string | null; subscription_expires_at?: string | null },
  now: Date = new Date(),
): SubscriptionStatus {
  const plan = user.subscription_plan || null;
  const expiresAt = user.subscription_expires_at || null;
  if (!expiresAt) return { level: plan ? 'active' : 'none', plan, expiresAt: null, daysLeft: null };

  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - now.getTime()) / MS_PER_DAY);
  const level: SubscriptionLevel =
    daysLeft <= 0 ? 'expired' : daysLeft <= SUBSCRIPTION_WARN_DAYS ? 'expiring' : 'active';
  return { level, plan, expiresAt, daysLeft };
}

/** A suspended seller must pay before they can sell. Mirrors requireAuth's needs_payment. */
export function needsSubscriptionPayment(user: { role?: string; status?: string }): boolean {
  return user.role === 'farmer' && user.status === 'suspended';
}
