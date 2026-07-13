/* Listing approval domain — the admin side of a seller's product request.
 *
 * A seller asks to sell a product; the listing lands in `pending` and an admin
 * says yes or no. Only then may the seller price it. (The seller's own view of
 * the same row is `listingState()` in farmer.ts, which is a RICHER lifecycle —
 * needs_price / cutoff_passed / listed / confirmed — because it also cares about
 * pricing and the daily cutoff. This module is only about the review decision.)
 *
 * MONEY: `farmer_price` IS in the money middleware's MONEY_FIELDS, so it crosses
 * the boundary as an already-converted RUPEE STRING. Do not divide by 100 — that
 * is the opposite of the raw-paise trap on GET /dashboard.
 */

/** The three states the backend's PATCH /listings/:id/status will accept. */
export type ListingReviewStatus = 'pending' | 'active' | 'rejected';

/**
 * What an admin may do to a listing in a given state, and the status each action
 * writes.
 *
 * Ported from the legacy admin.html button logic, which computed this inline three
 * times (`status !== 'active'`, `status !== 'rejected'`, `status === 'active'`).
 *
 *   pending  → approve (go live) | reject
 *   active   → deactivate (back to pending, hidden from customers) | reject
 *   rejected → approve — an admin can undo their own no; a rejection is not a
 *              tombstone, and a seller who fixed the problem should not have to
 *              re-request the product.
 *
 * "Deactivate" writes `pending`, NOT `rejected`: it pulls the produce off the
 * storefront and puts the row back in the review queue, which is a different thing
 * from telling the seller no.
 */
export type ListingAction = 'approve' | 'reject' | 'deactivate';

const ACTION_STATUS: Record<ListingAction, ListingReviewStatus> = {
  approve: 'active',
  reject: 'rejected',
  deactivate: 'pending',
};

/** The status an action writes. */
export function listingActionStatus(action: ListingAction): ListingReviewStatus {
  return ACTION_STATUS[action];
}

export function listingActions(status: string | null | undefined): ListingAction[] {
  const s = status || 'pending';
  if (s === 'active') return ['deactivate', 'reject'];
  if (s === 'rejected') return ['approve'];
  return ['approve', 'reject']; // pending, and anything unrecognised
}

/**
 * How many whole days a listing has been waiting, from submission to `now`.
 *
 * The point of an approval queue is that someone is WAITING at the other end of
 * it: a seller cannot price — and therefore cannot earn from — a product that is
 * still pending. Surfacing the wait is what stops a request quietly aging out of
 * sight. Returns 0 for today, and null if there is no timestamp to measure from.
 */
export function listingWaitDays(
  createdAt: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!createdAt) return null;
  const then = new Date(createdAt).getTime();
  if (!Number.isFinite(then)) return null;
  const days = Math.floor((now.getTime() - then) / 86_400_000);
  return days > 0 ? days : 0; // a clock skew must not read as "waiting -1 days"
}

/** Warn once a request has been sitting this long unreviewed. Matches the
 *  subscription reminder cadence (SUBSCRIPTION_WARN_DAYS) so "overdue" means the
 *  same span everywhere in the console. */
export const LISTING_STALE_DAYS = 10;

export function isListingStale(
  createdAt: string | null | undefined,
  status: string | null | undefined,
  now: Date = new Date(),
): boolean {
  // Only a PENDING listing can be overdue. An approved or rejected one is
  // finished — nobody is waiting on it, however old it is.
  if ((status || 'pending') !== 'pending') return false;
  const days = listingWaitDays(createdAt, now);
  return days !== null && days >= LISTING_STALE_DAYS;
}
