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

  // Delivery charge by seller→buyer distance (straight-line km). All money in PAISE.
  // The first slab is the LOCAL rule: ONE flat charge per order for every seller
  // within `localMaxKm`, waived when those local items reach `freeLocalMin`. Every
  // seller beyond it adds their own slab fee per parcel, never free. A distance we
  // can't measure (a missing pin) counts as local when the seller is in the
  // delivery district, else as the farthest slab. See utils/deliveryFee.js.
  delivery: {
    localMaxKm: 10,
    localFlat: 2500,                // ₹25
    freeLocalMin: 40000,            // ₹400 of local items → local delivery free
    slabs: [                        // beyond localMaxKm, first slab whose maxKm ≥ distance
      { maxKm: 30, fee: 4000 },     // ₹40
      { maxKm: 60, fee: 7000 },     // ₹70
      { maxKm: null, fee: 10000 },  // ₹100 — 60 km+ (null = no upper bound)
    ],
  },

  placeholder: true,                // flips the "illustrative" note in the header
};
