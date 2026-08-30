// ─────────────────────────────────────────────────────────────────────────────
// Farmer price sanity guard.
//
// A farmer sets `farmer_price` freely; the only check was `≥ 0`, so ₹0 or a
// fat-finger ₹9,999 flowed straight to the storefront (consumer price is just
// farmer_price × (1 + fee%)). There was a market reference the whole time — the
// APMC daily modal price synced into product_district_prices.market_price — but
// nothing used it to catch a mistake.
//
// This is a GUARDRAIL, not a margin policy. The band is deliberately wide: the
// mandi modal is a wholesale figure and a farmer's retail ask is legitimately a
// multiple of it (quality, organic, small-lot). We only block the clearly wrong —
// a price a quarter of the mandi rate, or five times above it — which is almost
// always a typo, not a business decision.
//
// All amounts are PAISE (integers), the unit both farmer_price and market_price
// are stored in — no unit juggling here.
// ─────────────────────────────────────────────────────────────────────────────

// How far from the mandi modal a price may stray before it reads as an error.
const LOW_MULT = 0.25; // below a quarter of the mandi rate → suspiciously cheap
const HIGH_MULT = 5; // above five times the mandi rate → almost certainly a typo

// Pure band check. `marketPaise` null/absent ⇒ no reference, only the zero floor
// applies (the caller still gets a clean {ok:true} for a positive price).
// Returns { ok, reason, min, max } — reason ∈ 'zero' | 'low' | 'high'; min/max are
// the allowed paise bounds when a reference exists (for the caller's message).
function priceBandCheck(farmerPaise, marketPaise) {
  const price = Number(farmerPaise);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: 'zero' };
  }
  const market = Number(marketPaise);
  if (!Number.isFinite(market) || market <= 0) {
    return { ok: true }; // no usable reference — floor already passed
  }
  const min = Math.round(market * LOW_MULT);
  const max = Math.round(market * HIGH_MULT);
  if (price < min) return { ok: false, reason: 'low', min, max, market };
  if (price > max) return { ok: false, reason: 'high', min, max, market };
  return { ok: true, min, max, market };
}

const rupees = (paise) => `₹${(Number(paise) / 100).toFixed(2)}`;

// The message a blocked price shows the farmer, in rupees, with the expected band.
function priceBandMessage(result, unit) {
  const per = unit ? ` per ${unit}` : '';
  if (result.reason === 'zero') {
    return `Enter a selling price greater than ₹0${per}.`;
  }
  const band = `${rupees(result.min)}–${rupees(result.max)}`;
  const ref = `today's market rate of ${rupees(result.market)}${per}`;
  if (result.reason === 'low') {
    return `That price looks too low against ${ref}. Expected roughly ${band}${per} — please double-check.`;
  }
  return `That price looks too high against ${ref}. Expected roughly ${band}${per} — please double-check.`;
}

module.exports = { priceBandCheck, priceBandMessage, LOW_MULT, HIGH_MULT };
