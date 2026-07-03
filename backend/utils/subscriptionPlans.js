// ─────────────────────────────────────────────────────────────────────────────
// Subscription plan catalogue.
// Amounts are in PAISE. Edit the numbers here to change pricing — nothing else
// needs to change. `days` drives the subscription validity (expiry) calculation.
// The ₹100 registration charge is a ONE-TIME fee, applied only on a seller's
// first activation (never on a renewal).
// ─────────────────────────────────────────────────────────────────────────────

const REGISTRATION_CHARGE = 10000; // ₹100 (one-time, first activation only)

// Women & Transgender sellers get 10% off the plan fee (registration charge is
// unaffected).
const CONCESSION_PCT = 10;
function concessionFor(gender) {
  return (gender === 'Female' || gender === 'Transgender') ? CONCESSION_PCT : 0;
}
function discountedAmount(baseAmount, gender) {
  return Math.round(baseAmount * (100 - concessionFor(gender)) / 100);
}

const PLANS = {
  'Monthly':     { days: 30,  amount: 20000 },  // ₹200
  'Quarterly':   { days: 90,  amount: 55000 },  // ₹550 (₹50 off 3×₹200)
  'Half Yearly': { days: 180, amount: 110000 }, // ₹1100 (₹100 off 6×₹200)
  'Yearly':      { days: 365, amount: 200000 }, // ₹2000 (₹400 off 12×₹200)
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
