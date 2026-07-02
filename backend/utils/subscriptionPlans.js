// ─────────────────────────────────────────────────────────────────────────────
// Subscription plan catalogue.
// Amounts are in PAISE. Edit the numbers here to change pricing — nothing else
// needs to change. `days` drives the subscription validity (expiry) calculation.
// The ₹100 registration charge is a ONE-TIME fee, applied only on a seller's
// first activation (never on a renewal).
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRATION_CHARGE = 10000; // ₹100 (one-time, first activation only)

// Women & Transgender sellers get 50% off the plan fee (registration charge is
// unaffected). Mirrors the concession the admin approval flow used previously.
const CONCESSION_PCT = 50;
function concessionFor(gender) {
  return (gender === 'Female' || gender === 'Transgender') ? CONCESSION_PCT : 0;
}
function discountedAmount(baseAmount, gender) {
  return Math.round(baseAmount * (100 - concessionFor(gender)) / 100);
}

const PLANS = {
  'Monthly':     { days: 30,  amount: 19900 },  // ₹199
  'Quarterly':   { days: 90,  amount: 49900 },  // ₹499
  'Half Yearly': { days: 180, amount: 89900 },  // ₹899
  'Yearly':      { days: 365, amount: 149900 }, // ₹1499
};

function getPlan(name) {
  return PLANS[name] || null;
}

function planList() {
  return Object.entries(PLANS).map(([name, p]) => ({
    name,
    days: p.days,
    amount: p.amount,
  }));
}

module.exports = { PLANS, REGISTRATION_CHARGE, CONCESSION_PCT, getPlan, planList, concessionFor, discountedAmount };
