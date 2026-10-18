// Distance-based delivery charge. Pure — no I/O — so POST /orders, the cart quote
// and the tests all share one implementation. The web mirror is
// packages/lib/src/delivery.ts; the slab numbers live in config/platform.js.
//
// The rule, per order:
//   • LOCAL sellers (≤ localMaxKm, or unmeasurable but in the delivery district)
//     share ONE flat charge for the whole order, free once their items reach
//     freeLocalMin. A cart of nearby sellers costs exactly what it did before
//     distance pricing existed.
//   • Every OTHER seller adds their own slab fee, per parcel, never free — a
//     seller 45 km away is a separate trip whatever the basket size.

const { distanceMeters, toCoord } = require('./geo');
const platform = require('../config/platform');

const CFG = platform.delivery;

/** Straight-line km between buyer and seller, to 1 decimal, or null when either pin is missing. */
function distanceKm(buyer, seller) {
  const m = distanceMeters(
    toCoord(buyer?.lat), toCoord(buyer?.lng),
    toCoord(seller?.lat), toCoord(seller?.lng),
  );
  return m === null ? null : Math.round(m / 100) / 10;
}

const sameText = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Which tier a seller falls in. { local: true } or { local: false, fee } (paise).
 * `distanceKm` null = cannot measure → local only when in the delivery district.
 */
function deliveryTier({ distanceKm: km, sameDistrict }, cfg = CFG) {
  if (km === null || km === undefined) {
    if (sameDistrict) return { local: true };
    return { local: false, fee: cfg.slabs[cfg.slabs.length - 1].fee };
  }
  if (km <= cfg.localMaxKm) return { local: true };
  const slab = cfg.slabs.find((s) => s.maxKm === null || km <= s.maxKm);
  return { local: false, fee: slab.fee };
}

/**
 * The order's delivery charge (paise) from its seller parcels.
 * parcels: [{ farmerId, distanceKm, sameDistrict, itemTotal (paise) }]
 * Returns { total, localFee, localItemTotal, parcels: [{ ...parcel, local, fee }] }
 * where a local parcel's `fee` is 0 (the shared charge is `localFee`).
 */
function deliveryCharge(parcels, cfg = CFG) {
  const priced = parcels.map((p) => {
    const tier = deliveryTier(p, cfg);
    return { ...p, local: tier.local, fee: tier.local ? 0 : tier.fee };
  });
  const local = priced.filter((p) => p.local && p.itemTotal > 0);
  const localItemTotal = local.reduce((s, p) => s + p.itemTotal, 0);
  const localFee = local.length === 0 || localItemTotal >= cfg.freeLocalMin ? 0 : cfg.localFlat;
  const total = localFee + priced.reduce((s, p) => s + (p.itemTotal > 0 ? p.fee : 0), 0);
  return { total, localFee, localItemTotal, parcels: priced };
}

/** The buyer's pin from a delivery address object ({lat,lng}), or null. */
function addressPin(addr) {
  const lat = toCoord(addr?.lat);
  const lng = toCoord(addr?.lng);
  return lat === null || lng === null ? null : { lat, lng };
}

module.exports = { distanceKm, deliveryTier, deliveryCharge, addressPin, sameText, DELIVERY: CFG };
