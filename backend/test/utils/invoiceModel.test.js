const test = require('node:test');
const assert = require('node:assert');
const {
  computeParty, invoiceNumber, platformInvoiceRef, platformLogin, panOf, ymdIST, seqFromCode,
} = require('../../utils/invoiceModel');
const platform = require('../../config/platform');

test('exempt produce → NIL GST, grand == subtotal', () => {
  const party = {
    isPlatform: false, type: 'Farmer', login: 'FRTNERD_RAJA01', gstin: null,
    address: { state: 'Tamil Nadu' }, roundOff: 0,
    lines: [{ name: 'Tomato', qty: 2, rate: 40, discount: 0 }],
  };
  const c = computeParty(party, 'Tamil Nadu');
  assert.strictEqual(c.anyTax, false);
  assert.strictEqual(c.taxable, 80);
  assert.strictEqual(c.cgst, 0);
  assert.strictEqual(c.grand, 80);
});

test('GST-inclusive platform charges → tax extracted, grand stays the charge total', () => {
  const party = {
    isPlatform: true, login: 'MATNPDK', gstin: platform.gstin,
    address: { state: 'Tamil Nadu' }, roundOff: 0,
    lines: [
      { name: 'Handling', qty: 1, rate: 8, gstRate: 18, inclusive: true, discount: 0 },
      { name: 'Fee', qty: 1, rate: 10, gstRate: 18, inclusive: true, discount: 0 },
      { name: 'Packaging', qty: 1, rate: 10, gstRate: 18, inclusive: true, discount: 0 },
    ],
  };
  const c = computeParty(party, 'Tamil Nadu');
  assert.strictEqual(c.inclusive, true);
  assert.strictEqual(c.grand, 28); // charge total, GST not added on top
  // taxable + cgst + sgst must reconstitute the charge total
  assert.strictEqual(Math.round((c.taxable + c.cgst + c.sgst) * 100) / 100, 28);
  assert.ok(c.taxable < 28 && c.taxable > 23); // ≈ 23.72
});

test('inter-state supply routes tax to IGST', () => {
  const party = {
    isPlatform: false, type: 'Retailer', login: 'RTKLXXX_A01', gstin: '32ABCFG5678H1Z2',
    address: { state: 'Kerala' }, roundOff: 0,
    lines: [{ name: 'Oil', qty: 1, rate: 320, discount: 0, hsn: '1508' }],
  };
  const c = computeParty(party, 'Tamil Nadu');
  assert.strictEqual(c.inter, true);
  assert.strictEqual(c.cgst, 0);
  assert.strictEqual(c.igst, 16); // 5% of 320
});

test('invoice numbers follow the login-ID scheme', () => {
  const seller = { isPlatform: false, login: 'FRTNERD_RAJA01' };
  assert.strictEqual(invoiceNumber(seller, '20260726', 1), 'FRTNERDRAJA01INV20260726000001');
  const plat = { isPlatform: true, login: platformLogin(platform) };
  assert.strictEqual(invoiceNumber(plat, '20260726', 1), 'MATNPDKPLTINV20260726000001');
  assert.strictEqual(platformInvoiceRef(platform, '20260726', 1), 'MATNPDKINV20260726000001');
});

test('PAN is derived from a GSTIN', () => {
  assert.strictEqual(panOf({ gstin: '33ABCFG5678H1Z2' }), 'ABCFG5678H');
  assert.strictEqual(panOf({ gstin: null, pan: 'BQKPR4471J' }), 'BQKPR4471J');
});

test('seqFromCode + ymdIST extract from an order code / timestamp', () => {
  assert.strictEqual(seqFromCode('ORDPDK260726000148'), 148);
  assert.strictEqual(ymdIST('2026-07-26T02:42:00.000Z'), '20260726'); // 08:12 IST
});
