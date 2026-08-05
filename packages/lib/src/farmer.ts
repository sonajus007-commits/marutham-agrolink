/* Farmer/seller domain: what a seller earns, what the customer pays, and when a
 * listing stops accepting orders. Pure and framework-agnostic, so the web
 * listing form and a future React Native app project the same numbers. */
import { dateLocale } from './format';
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

/* ── Order cutoff: a ROLLING window, computed in IST ──────────────────────────
 *
 * The seller picks when their listing stops taking orders. This used to be a
 * fixed list of sixteen clock times spanning "previous evening 8 PM" to "current
 * day 8 PM", which had two faults: most of it was already in the PAST by the time
 * a seller opened the form (you could close a listing at 6 AM at four in the
 * afternoon), and it was computed with setHours — the DEVICE's timezone — so a
 * phone on the wrong zone silently stored a cutoff hours away from what was shown.
 *
 * Now the options are generated: every whole hour from the next one up to and
 * including the next 8 AM, which is when the selling cycle closes. At 4:30 PM a
 * seller is offered 5 PM … 8 AM tomorrow; at 7:10 AM only 8 AM is left.
 *
 * Everything is anchored to IST, never to the device. India has one timezone and
 * no DST, so a fixed +5:30 is exact — and it means every seller nationwide sees
 * the same window at the same instant, whatever their phone believes.
 */

/** IST is UTC+5:30 year-round — no DST, so a constant offset is exact. */
export const IST_OFFSET_MINUTES = 330;

/** 8 AM IST closes the selling cycle: the last cutoff a seller can choose. */
export const DAILY_CLOSE_HOUR = 8;

const HOUR_MS = 3_600_000;

interface IstClock {
  y: number;
  m: number;
  d: number;
  h: number;
}

/** The IST wall-clock reading of an absolute instant. */
function istClock(at: Date): IstClock {
  const shifted = new Date(at.getTime() + IST_OFFSET_MINUTES * 60_000);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
    h: shifted.getUTCHours(),
  };
}

/**
 * The absolute instant at which IST reads y/m/d hour:00.
 * Date.UTC normalises overflow, so hour 25 or day 32 roll forward correctly —
 * that is what lets the slot walk cross midnight and month ends without special
 * cases.
 */
function istInstant(c: { y: number; m: number; d: number }, hour: number): Date {
  return new Date(Date.UTC(c.y, c.m, c.d, hour) - IST_OFFSET_MINUTES * 60_000);
}

/** "5 PM", "12 AM", "12 PM" from a 24-hour clock hour. */
export function formatHour12(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve} ${suffix}`;
}

/** Which IST day a slot lands on, relative to the seller's now. */
export type CutoffDay = 'today' | 'tomorrow';

export interface CutoffSlot {
  /** Stored verbatim in farmer_listings.time_available, e.g. "5 PM". */
  value: string;
  /** The clock time alone — identical in every language, so it is never translated. */
  time: string;
  /** 24-hour clock hour in IST. */
  hour: number;
  /** Absolute instant this cutoff falls at; goes to farmer_listings.cutoff_ts. */
  ts: string;
  /** Optgroup heading. A VALUE — the screen keys its translation off it. */
  day: CutoffDay;
}

/**
 * The cutoffs a seller may choose right now: every whole IST hour from the next
 * one through the next 8 AM. Never empty — 8 AM is always reachable, and when the
 * window has almost run out it is the only entry left.
 */
export function cutoffSlots(now: Date = new Date()): CutoffSlot[] {
  const c = istClock(now);

  // The next whole hour. Strictly after `now`: a cutoff at the current hour has
  // either passed or is passing, and would be expired before anyone could order.
  const start = istInstant(c, c.h + 1);

  // The next 8 AM at or after that. When the day's 8 AM has gone, it is tomorrow's.
  let end = istInstant(c, DAILY_CLOSE_HOUR);
  if (end.getTime() < start.getTime()) end = istInstant({ ...c, d: c.d + 1 }, DAILY_CLOSE_HOUR);

  const slots: CutoffSlot[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += HOUR_MS) {
    const at = new Date(t);
    const clock = istClock(at);
    slots.push({
      value: formatHour12(clock.h),
      time: formatHour12(clock.h),
      hour: clock.h,
      ts: at.toISOString(),
      day: clock.d === c.d ? 'today' : 'tomorrow',
    });
  }
  return slots;
}

/**
 * The cutoff every listing falls back to when nobody chose one — always the LAST
 * slot of the window, so it is the most permissive choice rather than one that
 * expires in an hour. 8 AM closes the cycle, so it is always present.
 */
export const DEFAULT_CUTOFF = formatHour12(DAILY_CLOSE_HOUR);

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
 * The absolute instant for a chosen cutoff, or null when that choice is no longer
 * on offer — a value from a stale form, or one the seller sat on until it expired.
 * Null is the REFUSAL: the caller must make them pick again rather than quietly
 * booking a cutoff in the past. Resolved against the live window, so it is exact
 * in IST regardless of what the device's clock is set to.
 */
export function cutoffTimestamp(value: string, now: Date = new Date()): string | null {
  const hour = parseCutoffHour(value);
  if (hour === null) return null;
  return cutoffSlots(now).find((s) => s.hour === hour)?.ts ?? null;
}

/** Display label for a stored value, falling back to the value itself. */
export function cutoffLabel(value: string): string {
  return value;
}

/* ── Retailer shop hours ──────────────────────────────────────────────────────
 *
 * A farmer's cutoff belongs to a LISTING (this harvest stops selling at 6 PM); a
 * retailer's hours belong to the SHOP (we are open 9-7, every day), so they live
 * on the account and every listing inherits them. Both are read in IST.
 *
 * The band is the business rule: retailers trade between 8 AM and 8 PM, for
 * ordering and for pickup. Mirrored by a CHECK constraint in migration 035 — this
 * copy only exists to tell the retailer before a pointless round trip.
 */

/** Earliest hour a retailer may open (8 AM IST). */
export const SHOP_BAND_OPEN = 8;
/** Latest hour a retailer may close (8 PM IST). */
export const SHOP_BAND_CLOSE = 20;

export interface ShopHourOption {
  hour: number;
  label: string;
}

/** Selectable hours across the trading band, inclusive of both ends. */
export function shopHourOptions(): ShopHourOption[] {
  const out: ShopHourOption[] = [];
  for (let h = SHOP_BAND_OPEN; h <= SHOP_BAND_CLOSE; h++)
    out.push({ hour: h, label: formatHour12(h) });
  return out;
}

export type ShopHoursProblem = 'required' | 'band' | 'order';

/**
 * Why a retailer's chosen window is unacceptable, or null when it is fine.
 * `null`/undefined hours are 'required' — a retailer has to state their hours
 * before they can sell, so "not chosen yet" is a problem, not an empty success.
 */
export function validateShopHours(
  open: number | null | undefined,
  close: number | null | undefined,
): ShopHoursProblem | null {
  if (open == null || close == null) return 'required';
  if (!Number.isInteger(open) || !Number.isInteger(close)) return 'band';
  if (open < SHOP_BAND_OPEN || open > SHOP_BAND_CLOSE) return 'band';
  if (close < SHOP_BAND_OPEN || close > SHOP_BAND_CLOSE) return 'band';
  // Equal is rejected too: a window that opens and shuts at the same hour is shut.
  if (open >= close) return 'order';
  return null;
}

/** "9 AM – 7 PM", or null when the retailer has not set their hours yet. */
export function shopHoursLabel(
  open: number | null | undefined,
  close: number | null | undefined,
): string | null {
  if (open == null || close == null) return null;
  return `${formatHour12(open)} – ${formatHour12(close)}`;
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

/**
 * Why a listing draft cannot be saved.
 *
 * A CODE, not a sentence. These used to be the English messages themselves,
 * which faulted a translated form in English — and lib cannot reach i18n, being
 * pure and shared with React Native. Same call as `validateAddress`; see
 * `listingProblemKey`.
 */
export type ListingProblem =
  | 'product'
  | 'price'
  | 'qty'
  | 'cutoff'
  | 'bulkPair'
  | 'bulkMax'
  | 'bulkOverQty'
  | 'ruleType'
  | 'ruleOverQty';

/** First problem with the draft, or null. */
export function validateListing(d: ListingDraft): ListingProblem | null {
  if (!d.product_id) return 'product';
  const price = Number(d.farmer_price);
  if (!(price > 0)) return 'price';
  const qty = Number(d.qty_available);
  if (!(qty > 0)) return 'qty';
  if (parseCutoffHour(d.time_available) === null) return 'cutoff';

  const bulkQty = Number(d.bulk_qty || 0);
  const bulkDisc = Number(d.bulk_disc_pct || 0);
  if (bulkQty > 0 !== bulkDisc > 0) return 'bulkPair';
  if (bulkDisc > MAX_BULK_DISC_PCT) return 'bulkMax';
  if (bulkQty > 0 && bulkQty > qty) return 'bulkOverQty';

  const qtyValue = Number(d.qty_value || 0);
  if (qtyValue > 0 && !d.qty_type) return 'ruleType';
  if (qtyValue > 0 && qtyValue > qty) return 'ruleOverQty';

  return null;
}

/**
 * The i18n key for a listing problem. `en` carries the wording.
 *
 * `bulkMax` interpolates `{{max}}` — pass MAX_BULK_DISC_PCT rather than baking 90
 * into the copy, so the cap and the sentence cannot drift apart in two languages.
 */
export function listingProblemKey(problem: ListingProblem): string {
  return `listing.err.${problem}`;
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
  const pending = payouts
    .filter((p) => p.status === 'pending')
    .reduce((s, p) => s + rs(p.amount), 0);

  const settledOrderIds = new Set(payouts.map((p) => p.order?.id).filter(Boolean));

  const awaiting = orders
    .filter((o) => o.status === 'Delivered' && !isOrderCancelled(o) && !settledOrderIds.has(o.id))
    .reduce((s, o) => s + rs(o.farmer_payout), 0);

  const inFlight = orders.filter(isOrderActive).reduce((s, o) => s + rs(o.farmer_payout), 0);

  return { paid, pending, awaiting, inFlight, lifetime: paid + pending + awaiting };
}

/** One bar of the weekly-earnings trend. `amount` is in rupees (the API already
 *  converted from paise), so it formats with fmtMoney exactly like the tiles. */
export interface WeekEarning {
  /** ISO date of that week's Monday — a stable key. */
  weekStart: string;
  /** ISO date of that week's Sunday (weekStart + 6 days). */
  weekEnd: string;
  /** Short axis label for the week's start, e.g. "7 Jul". */
  label: string;
  /** Start–end range label, e.g. "7–13 Jul" (or "28 Jun – 4 Jul" across months). */
  rangeLabel: string;
  amount: number;
}

/** "7–13 Jul" when the week sits in one month, "28 Jun – 4 Jul" when it spans two. */
function weekRangeLabel(start: Date, end: Date, lang?: string | null): string {
  const locale = dateLocale(lang);
  const endLabel = end.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString(locale, { day: 'numeric' })}–${endLabel}`;
  }
  const startLabel = start.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  return `${startLabel} – ${endLabel}`;
}

/** Monday 00:00 of the week containing `d` (weeks run Mon–Sun, as the market does). */
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // getDay 0=Sun → shift so Mon=0
  return x;
}

/* The bar label was `${date} ${MONTHS[month]}` off a hardcoded English array, so
 * the trend chart's axis stayed English on a Tamil dashboard. Intl gives the same
 * "12 Jul" for en-IN — byte-identical to the array it replaces — and "ஜூலை 12"
 * for ta-IN, where the month leads. */

/**
 * A farmer's DELIVERED earnings bucketed into the last `weeks` calendar weeks
 * (oldest → newest), for the earnings trend chart. Counts `farmer_payout` on
 * delivered, non-cancelled orders — the same figure the tiles sum — placed by
 * `delivered_at` (falling back to `created_at` for older rows that predate that
 * column). Weeks with no deliveries are kept as zero so the axis is continuous.
 */
export function farmerWeeklyEarnings(
  orders: Order[],
  weeks = 8,
  now: Date = new Date(),
  /** App language for the bar labels. Omit and they stay en-IN, as before. */
  lang?: string | null,
): WeekEarning[] {
  const current = startOfWeek(now);
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const start = new Date(current);
    start.setDate(start.getDate() - (weeks - 1 - i) * 7);
    return { start, amount: 0 };
  });
  const firstMs = buckets[0].start.getTime();

  for (const o of orders) {
    if (o.status !== 'Delivered' || isOrderCancelled(o)) continue;
    const when = o.delivered_at || o.created_at;
    if (!when) continue;
    const t = new Date(when).getTime();
    if (Number.isNaN(t) || t < firstMs) continue;
    const wsMs = startOfWeek(new Date(t)).getTime();
    const bucket = buckets.find((b) => b.start.getTime() === wsMs);
    if (bucket) bucket.amount += rs(o.farmer_payout);
  }

  return buckets.map((b) => {
    const end = new Date(b.start);
    end.setDate(end.getDate() + 6);
    return {
      weekStart: b.start.toISOString(),
      weekEnd: end.toISOString(),
      label: b.start.toLocaleDateString(dateLocale(lang), { day: 'numeric', month: 'short' }),
      rangeLabel: weekRangeLabel(b.start, end, lang),
      amount: b.amount,
    };
  });
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
  | 'pending' // awaiting admin approval
  | 'rejected' // admin declined
  | 'needs_price' // approved, no price yet
  | 'cutoff_passed' // priced, but the cutoff elapsed — re-price to re-list
  | 'listed' // live, awaiting the seller's confirmation
  | 'confirmed'; // live and confirmed for delivery

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
  /** Why an admin declined this product request — the seller is shown it verbatim.
   *  Only set while `listing_status === 'rejected'`; approving or deactivating
   *  clears it, so a live listing never carries a stale objection. */
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
