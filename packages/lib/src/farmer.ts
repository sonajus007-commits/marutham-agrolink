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
 * `consumerPrice = round_to_paise(farmerPrice × (1 + fee%)) + handling`
 *
 * The rounding happens in PAISE, mirroring routes/listings.js exactly:
 *   Math.round(farmer_price_paise * (1 + feePct / 100))
 * Rounding in rupees instead is off by a paisa — ₹33.50 at 5% previews as
 * ₹35.17 but is actually charged at ₹35.18. The preview's whole job is to say
 * what the customer pays, so it must round the same way the server does.
 */
export function projectConsumerPrice(
  farmerPrice: number,
  sellerType: SellerType | null | undefined,
  handling = 0,
): PricePreview {
  const feePct = sellerFeePct(sellerType);
  const withFeePaise = Math.round(rupeesToPaise(farmerPrice) * (1 + feePct / 100));
  const withFee = withFeePaise / 100;
  return {
    farmerPrice,
    feePct,
    fee: withFee - farmerPrice,
    handling,
    consumerPrice: withFee + handling,
  };
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
 * `farmer_listings.time_available` stores the option VALUE ("8 PM", "8 PM
 * (today)", "12 AM"), which is not the same as the label the seller sees
 * ("8 PM (previous evening)"). Values already in the database include "9 AM"
 * and "8 PM (today)".
 *
 * The hour is parsed rather than looked up, so a value the option list no
 * longer offers still resolves — a lookup table would have returned null and
 * silently blanked the cutoff when the seller edited an old listing.
 *
 * Note "8 PM" and "8 PM (today)" resolve identically: both mean 20:00, next
 * occurrence. The grouping is presentation only, exactly as the legacy page
 * treated it. */

export interface CutoffOption {
  /** Stored verbatim in farmer_listings.time_available. */
  value: string;
  /** What the seller reads. */
  label: string;
  /** Optgroup heading. */
  group: 'Previous Evening' | 'Current Day';
}

export const CUTOFF_OPTIONS: readonly CutoffOption[] = [
  { value: '8 PM', label: '8 PM (previous evening)', group: 'Previous Evening' },
  { value: '9 PM', label: '9 PM (previous evening)', group: 'Previous Evening' },
  { value: '10 PM', label: '10 PM (previous evening)', group: 'Previous Evening' },
  { value: '11 PM', label: '11 PM (previous evening)', group: 'Previous Evening' },
  { value: '12 AM', label: '12 AM (midnight)', group: 'Current Day' },
  { value: '4 AM', label: '4 AM', group: 'Current Day' },
  { value: '6 AM', label: '6 AM', group: 'Current Day' },
  { value: '7 AM', label: '7 AM', group: 'Current Day' },
  { value: '8 AM', label: '8 AM', group: 'Current Day' },
  { value: '9 AM', label: '9 AM', group: 'Current Day' },
  { value: '10 AM', label: '10 AM', group: 'Current Day' },
  { value: '12 PM', label: '12 PM (noon)', group: 'Current Day' },
  { value: '2 PM', label: '2 PM', group: 'Current Day' },
  { value: '4 PM', label: '4 PM', group: 'Current Day' },
  { value: '6 PM', label: '6 PM', group: 'Current Day' },
  { value: '8 PM (today)', label: '8 PM (current day)', group: 'Current Day' },
];

export const DEFAULT_CUTOFF = '8 AM';

/** 24-hour clock from a stored value like "8 PM (today)", or null if unreadable. */
export function parseCutoffHour(value: string): number | null {
  const m = /^\s*(\d{1,2})\s*(AM|PM)\b/i.exec(String(value || ''));
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  if (hour < 1 || hour > 12) return null;
  const pm = m[2].toUpperCase() === 'PM';
  if (pm && hour !== 12) hour += 12;
  if (!pm && hour === 12) hour = 0;
  return hour;
}

/**
 * Absolute timestamp for a cutoff value: the next occurrence of that hour.
 * If the hour has already passed today, it rolls to tomorrow.
 */
export function cutoffTimestamp(value: string, now: Date = new Date()): string | null {
  const hour = parseCutoffHour(value);
  if (hour === null) return null;
  const d = new Date(now);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

/** Display label for a stored value, falling back to the value itself. */
export function cutoffLabel(value: string): string {
  return CUTOFF_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

/* ── Listing validation ────────────────────────────────────────────────────
 * The server re-checks everything; this only decides what to tell the seller
 * before a pointless round trip. */

/* Numeric fields are held as the raw string the seller typed, so an
 * in-progress "3." is not collapsed to 3 while they are still typing. Coerced
 * with Number() at validation and at the API boundary. */
export type NumericInput = number | string | '';

export interface ListingDraft {
  product_id: string;
  /** Rupees, as typed. Converted to paise at the API boundary. */
  farmer_price: NumericInput;
  qty_available: NumericInput;
  time_available: string;
  bulk_qty?: NumericInput;
  bulk_disc_pct?: NumericInput;
  qty_type?: 'MOQ' | 'SPQ' | '';
  qty_value?: NumericInput;
}

/** First problem with the draft, or null. */
export function validateListing(d: ListingDraft): string | null {
  if (!d.product_id) return 'Select a product.';
  const price = Number(d.farmer_price);
  if (!(price > 0)) return 'Enter your selling price.';
  const qty = Number(d.qty_available);
  if (!(qty > 0)) return 'Enter the quantity you have available.';
  if (parseCutoffHour(d.time_available) === null) return 'Choose when orders should stop.';

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

/* ── Listing lifecycle ─────────────────────────────────────────────────────
 * A listing carries four independent flags, and the legacy card re-derived the
 * state from them inline at three call sites. Collapse them into one value.
 *
 *   listing_status  pending → admin has not reviewed the product request
 *                   rejected → admin said no
 *                   active   → approved; the seller may price it
 *   farmer_price    0 until the seller sets one
 *   listed          the hourly job clears this once cutoff_ts passes
 *   confirmed       the seller has committed today's stock for delivery
 */

export type ListingState =
  | 'pending'       // awaiting admin approval
  | 'rejected'      // admin declined
  | 'needs_price'   // approved, no price yet
  | 'cutoff_passed' // priced, but the cutoff elapsed — re-price to re-list
  | 'listed'        // live, awaiting the seller's confirmation
  | 'confirmed';    // live and confirmed for delivery

export interface FarmerListing {
  id: string;
  product_id: string;
  /** Rupees, as a string — money crosses the boundary already converted. */
  farmer_price: string | number;
  qty_available?: number | null;
  time_available?: string | null;
  cutoff_ts?: string | null;
  bulk_qty?: number | null;
  bulk_disc_pct?: number | null;
  qty_type?: 'MOQ' | 'SPQ' | null;
  qty_value?: number | null;
  images?: string[] | null;
  listed?: boolean;
  confirmed?: boolean;
  listing_status?: 'pending' | 'active' | 'rejected' | (string & {});
  /** Column does not exist yet — always undefined. See listings README. */
  rejection_reason?: string | null;
  product?: {
    id: string;
    name: string;
    unit?: string;
    regional_name?: string;
    product_group?: string;
    category?: string;
    available?: boolean;
  } | null;
}

export function listingPriceRs(l: FarmerListing): number {
  return parseFloat(String(l.farmer_price ?? 0)) || 0;
}

export function listingState(l: FarmerListing): ListingState {
  const status = l.listing_status || 'pending';
  if (status === 'pending') return 'pending';
  if (status === 'rejected') return 'rejected';
  if (listingPriceRs(l) <= 0) return 'needs_price';
  if (l.confirmed) return 'confirmed';
  return l.listed ? 'listed' : 'cutoff_passed';
}

/** Only a live, priced, unconfirmed listing can be confirmed for delivery. */
export function canConfirmListing(l: FarmerListing): boolean {
  return listingState(l) === 'listed';
}

/** Products a seller has not already requested, in any state. */
export function requestableProducts<T extends { id: string; available?: boolean }>(
  products: T[],
  listings: FarmerListing[],
): T[] {
  const taken = new Set(listings.map((l) => l.product?.id ?? l.product_id));
  return products.filter((p) => p.available !== false && !taken.has(p.id));
}

/* ── Money at the API boundary ─────────────────────────────────────────────
 * convertMoney() converts paise → rupees on RESPONSES only. Nothing converts
 * back on the way in, so a value read from a GET and posted straight back is
 * 100x wrong. Every write goes through here. */

/** Rupees (as typed) → paise (as stored). */
export function rupeesToPaise(rupees: number | string): number {
  return Math.round((parseFloat(String(rupees)) || 0) * 100);
}
