// Money is stored in PAISE (integers) in the database. Every field named below
// is converted to Rupees, as a 2-decimal string, in every API response.
//
// TWO RULES, both learned the hard way:
//
//   1. If a response carries a money value, its field name MUST be in this set.
//      A sibling left out keeps its paise value, and the client renders two
//      different units side by side. That produced a subscription screen reading
//      "Pay ₹2 & Activate" for a ₹300 charge, because `amount` was converted and
//      `registration_charge` was not.
//
//   2. NEVER divide by 100 by hand before returning a value. This runs on the
//      whole response, so a pre-divided field is converted twice: ₹100 → ₹1.00.
//
// Conversion is one-directional — responses only. Nothing converts rupees back
// to paise on the way IN, so a handler must never take a money value from the
// request body. (A client echoing back a rupee price once made partial refunds
// 100x too small; see backend/utils/returns.js.)
const MONEY_FIELDS = new Set([
  // orders
  'item_total', 'market_fee', 'delivery', 'total', 'saved', 'refund_amt',
  // orders + product_district_prices + return_lines
  'handling',
  // order_items + return_lines
  'price', 'govt_price',
  // order_items + farmer_listings
  'farmer_price', 'base_farmer_price',
  // product_district_prices
  'market_price',
  // payouts + returns
  'amount',
  // consumers/farmers directory rollups (accumulated from order totals in paise)
  'total_spend', 'total_revenue',
  // users + subscription_payments + GET /subscription/plans
  'subscription_amount', 'registration_charge',
  'plan_amount', 'total_amount', 'base_amount', 'amount_paid',
]);

function paiseToRupees(value) {
  if (value == null) return value;
  return (value / 100).toFixed(2); // e.g. 4200 → "42.00", 4215 → "42.15"
}

function convertMoney(value) {
  if (Array.isArray(value)) return value.map(convertMoney);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = MONEY_FIELDS.has(k) ? paiseToRupees(v) : convertMoney(v);
    }
    return out;
  }
  return value;
}

module.exports = { convertMoney };
