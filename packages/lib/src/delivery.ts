/* Distance-based delivery charge — the web mirror of backend/utils/deliveryFee.js
 * (numbers from backend/config/platform.js `delivery`). RUPEES here, paise there.
 * POST /orders is authoritative; this exists so the cart shows the same figure
 * before checkout. Change a number in both places, or the bill and the order
 * disagree.
 *
 *   • LOCAL sellers (≤ 10 km, or unmeasurable but in the delivery district) share
 *     ONE ₹25 for the order, free once their items reach ₹400.
 *   • Every other seller adds their own slab, per parcel, never free. */

export const DELIVERY_LOCAL_MAX_KM = 10;
export const DELIVERY_SLABS: ReadonlyArray<{ maxKm: number | null; fee: number }> = [
  { maxKm: 30, fee: 40 },
  { maxKm: 60, fee: 70 },
  { maxKm: null, fee: 100 }, // 60 km+
];

/** One seller's distance facts, as POST /orders/delivery-quote returns them. */
export interface SellerGeo {
  farmer_id: string;
  /** Straight-line km to the delivery pin; null when either side has no pin. */
  distance_km: number | null;
  same_district: boolean;
}

export type DeliveryTier = { local: true } | { local: false; fee: number };

export function deliveryTier(
  distanceKm: number | null | undefined,
  sameDistrict: boolean,
): DeliveryTier {
  if (distanceKm == null) {
    return sameDistrict
      ? { local: true }
      : { local: false, fee: DELIVERY_SLABS[DELIVERY_SLABS.length - 1].fee };
  }
  if (distanceKm <= DELIVERY_LOCAL_MAX_KM) return { local: true };
  const slab = DELIVERY_SLABS.find((s) => s.maxKm === null || distanceKm <= s.maxKm)!;
  return { local: false, fee: slab.fee };
}

export interface DeliveryParcel {
  farmerId: string;
  distanceKm: number | null;
  sameDistrict: boolean;
  itemTotal: number; // ₹
}

export interface DeliveryQuote {
  total: number;
  /** The shared local charge (0 when free or no local seller). */
  localFee: number;
  localItemTotal: number;
  hasLocal: boolean;
  /** Sellers beyond the local radius, each with their own slab fee. */
  far: Array<{ farmerId: string; distanceKm: number | null; fee: number }>;
}

/** The order's delivery charge in ₹. Mirrors deliveryCharge() in the backend. */
export function deliveryCharge(
  parcels: DeliveryParcel[],
  freeLocalMin: number,
  localFlat: number,
): DeliveryQuote {
  const live = parcels.filter((p) => p.itemTotal > 0);
  const far: DeliveryQuote['far'] = [];
  let localItemTotal = 0;
  let hasLocal = false;
  for (const p of live) {
    const tier = deliveryTier(p.distanceKm, p.sameDistrict);
    if (tier.local) {
      hasLocal = true;
      localItemTotal += p.itemTotal;
    } else far.push({ farmerId: p.farmerId, distanceKm: p.distanceKm, fee: tier.fee });
  }
  const localFee = !hasLocal || localItemTotal >= freeLocalMin ? 0 : localFlat;
  return {
    total: localFee + far.reduce((s, f) => s + f.fee, 0),
    localFee,
    localItemTotal,
    hasLocal,
    far,
  };
}

/** "~3.2 km" (one decimal under 10 km, whole km beyond) — straight-line, so approximate. */
export function fmtKm(km: number | null | undefined): string {
  if (km == null || !Number.isFinite(km)) return '';
  return `~${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}
