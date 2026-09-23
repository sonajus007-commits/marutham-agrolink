// Pure §194-O TDS helper. No DB / config import so the settlement route and the tests
// can call it directly — the caller passes the rates it read from config/platform.js.
//
// §194-O makes an e-commerce operator deduct TDS on the GROSS amount of sales it
// facilitates to a participant (seller). Rules, applied in order:
//   1. No PAN on file            → §206AA higher rate (5%).
//   2. Individual (Farmer) with  → EXEMPT while the seller's gross sales through the
//      PAN, gross ≤ ₹5L this FY     platform stay at/under the FY threshold.
//   3. Everyone else             → the standard rate (0.1% since 1 Oct 2024).
// Businesses (Retailer) get no threshold — always deducted.

/**
 * @param {object}  a
 * @param {number}  a.grossPaise    gross sale value facilitated to the seller (paise) — the base.
 * @param {string}  a.sellerType    'Farmer' (individual/HUF) | 'Retailer' (business).
 * @param {boolean} a.hasPan        whether the seller has furnished a PAN.
 * @param {number}  a.fyGrossPaise  seller's total gross facilitated this FY INCLUDING grossPaise.
 * @param {object}  a.config        { ecommerceRate, noPanRate, individualExemptionFY } — from platform.tds.
 * @returns {{ rate:number, tds_paise:number }} rate is the percent applied (0 when exempt).
 */
function computeTds({ grossPaise, sellerType, hasPan, fyGrossPaise, config }) {
  const gross = Math.max(0, Math.round(Number(grossPaise) || 0));
  const cfg = config || {};

  let rate;
  if (!hasPan) {
    rate = Number(cfg.noPanRate || 0);                 // §206AA
  } else if (
    sellerType === 'Farmer' &&
    Number(fyGrossPaise || 0) <= Number(cfg.individualExemptionFY || 0) * 100
  ) {
    rate = 0;                                          // below the individual FY threshold
  } else {
    rate = Number(cfg.ecommerceRate || 0);             // §194-O standard
  }

  return { rate, tds_paise: Math.round((gross * rate) / 100) };
}

module.exports = { computeTds };
