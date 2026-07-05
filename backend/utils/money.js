// All money fields stored in paise (integer) in the DB.
// These fields are converted to Rupees (2 decimal places) in every API response.
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
