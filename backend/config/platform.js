// ─────────────────────────────────────────────────────────────────────────────
// Platform (Marutham AgroLink) identity used on invoices.
//
// ⚠ The registration numbers below are PLACEHOLDERS. Replace gstin / fssai / cin
// with the company's real values before these invoices are treated as legal GST
// documents. `serviceGst` is the GST rate charged on the platform's own service
// charges (delivery / handling / multi-seller fee) and is fully configurable.
// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  name: 'Marutham AgroLink Private Limited',
  short: 'Marutham AgroLink',
  emoji: '🌱',
  address: { village: 'Thirumayam Road', district: 'Pudukkottai', state: 'Tamil Nadu', pincode: '622001' },
  care: '1800-123-4567',
  email: 'support@maruthamagrolink.in',
  web: 'maruthamagrolink.in',

  gstin: '33AAMCM1234K1Z9',        // PLACEHOLDER — real platform GSTIN
  fssai: '12421011000123',          // PLACEHOLDER — real platform FSSAI licence
  cin:   'U01100TZ2025PTC012345',   // PLACEHOLDER — real CIN

  serviceGst: 18,                   // GST% applied to platform service charges

  // TDS the platform deducts from seller settlements as an e-commerce operator (§194-O).
  // Rates are percentages; the exemption is a rupee threshold. All configurable so a
  // rate change (e.g. the 2024 cut from 1% → 0.1%) is a one-line edit, never in logic.
  tds: {
    ecommerceRate: 0.1,             // §194-O standard rate (since 1 Oct 2024)
    noPanRate: 5,                   // §206AA — seller has furnished no PAN
    individualExemptionFY: 500000,  // ₹ — individuals/HUF exempt below this FY gross (PAN on file)
    fyStartMonth: 4,                // Indian financial year starts April (month 4)
  },

  placeholder: true,                // flips the "illustrative" note in the header
};
