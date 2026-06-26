// Platform fee rates by seller type.
// Farmers (direct producers) pay a lower fee to keep produce affordable.
// Retailers pay a standard commercial rate.
// To change rates: update these two constants only — nothing else needs to change.
const FARMER_FEE_PCT   = 5;   // 5%
const RETAILER_FEE_PCT = 10;  // 10%

function getFeeForSeller(sellerType) {
  if (sellerType === 'Retailer') return RETAILER_FEE_PCT;
  return FARMER_FEE_PCT; // 'Farmer' or legacy accounts without seller_type
}

module.exports = { FARMER_FEE_PCT, RETAILER_FEE_PCT, getFeeForSeller };
