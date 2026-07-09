/* Platform fee rates. Mirrors backend/utils/fees.js — the server is the
 * authority and recomputes the consumer price on every listing read and every
 * order; these exist so a seller can be shown what her customer will pay before
 * she saves, and so the storefront can fall back when the API omits the price.
 *
 * Own module (rather than living in farmer.ts) because both the consumer
 * storefront and the seller's listing form need it, and importing across those
 * two would be circular.
 *
 * NOTE `products.platform_fee_pct` looks like this fee but is NOT used by the
 * server — it survives only in seed data, and reads 5% even for Retailers, who
 * are charged 10%. Always use sellerFeePct(). */

export const FARMER_FEE_PCT = 5;
export const RETAILER_FEE_PCT = 10;

export type SellerType = 'Farmer' | 'Retailer' | (string & {});

/** Fee percentage for a seller. Accounts with no seller_type are legacy farmers. */
export function sellerFeePct(sellerType?: SellerType | null): number {
  return sellerType === 'Retailer' ? RETAILER_FEE_PCT : FARMER_FEE_PCT;
}
