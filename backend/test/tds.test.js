const test = require('node:test');
const assert = require('node:assert/strict');
const { computeTds } = require('../utils/tds');

// The rates the platform config carries — passed in explicitly (computeTds is pure).
const config = { ecommerceRate: 0.1, noPanRate: 5, individualExemptionFY: 500000 };

// A ₹10,000 (10_00_000 paise) gross settlement unless overridden.
const base = { grossPaise: 1000000, sellerType: 'Farmer', hasPan: true, fyGrossPaise: 1000000, config };

test('computeTds — §194-O rules', async (t) => {
  await t.test('no PAN → 5% (§206AA), regardless of type or threshold', () => {
    const r = computeTds({ ...base, hasPan: false, fyGrossPaise: 1000 });
    assert.equal(r.rate, 5);
    assert.equal(r.tds_paise, 50000); // 5% of 10_00_000
  });

  await t.test('Farmer with PAN under the ₹5L FY threshold → exempt', () => {
    // FY gross ₹4L (40_00_000 paise) ≤ ₹5L exemption → no TDS.
    const r = computeTds({ ...base, fyGrossPaise: 4000 * 100 });
    assert.equal(r.rate, 0);
    assert.equal(r.tds_paise, 0);
  });

  await t.test('Farmer with PAN over the ₹5L FY threshold → 0.1%', () => {
    // FY gross ₹6L > ₹5L → standard rate applies.
    const r = computeTds({ ...base, fyGrossPaise: 600000 * 100 });
    assert.equal(r.rate, 0.1);
    assert.equal(r.tds_paise, 1000); // 0.1% of 10_00_000
  });

  await t.test('Retailer (business) has no threshold → always 0.1%, even on ₹1', () => {
    const r = computeTds({ ...base, sellerType: 'Retailer', grossPaise: 100, fyGrossPaise: 100 });
    assert.equal(r.rate, 0.1);
    assert.equal(r.tds_paise, 0); // 0.1% of ₹1 rounds to 0 paise
  });

  await t.test('exactly at the ₹5L threshold is still exempt (≤, not <)', () => {
    const r = computeTds({ ...base, fyGrossPaise: 500000 * 100 });
    assert.equal(r.rate, 0);
  });

  await t.test('zero / missing gross never throws and yields 0', () => {
    assert.equal(computeTds({ ...base, grossPaise: 0 }).tds_paise, 0);
    assert.equal(computeTds({ ...base, grossPaise: undefined }).tds_paise, 0);
  });
});
