// Locks the farmer price sanity guard (utils/priceGuard). The band is wide on
// purpose — it must pass a normal retail markup over the mandi rate and only trip
// on ₹0 or an off-by-10x typo. All amounts are paise.

const test = require('node:test');
const assert = require('node:assert/strict');
const { priceBandCheck, priceBandMessage } = require('../utils/priceGuard');

const MARKET = 5000; // ₹50/kg mandi modal → band ₹12.50–₹250 (0.25×–5×)

test('₹0 or negative is always blocked (reason "zero"), reference or not', () => {
  assert.equal(priceBandCheck(0, MARKET).reason, 'zero');
  assert.equal(priceBandCheck(-100, MARKET).reason, 'zero');
  assert.equal(priceBandCheck(0, null).reason, 'zero');
});

test('a normal retail markup over the mandi rate passes', () => {
  assert.equal(priceBandCheck(10000, MARKET).ok, true); // ₹100, 2× mandi
  assert.equal(priceBandCheck(6000, MARKET).ok, true); // ₹60, just above mandi
});

test('a price a quarter below the mandi rate is blocked (reason "low")', () => {
  const r = priceBandCheck(1000, MARKET); // ₹10 vs ₹12.50 floor
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'low');
  assert.equal(r.min, 1250);
  assert.equal(r.max, 25000);
});

test('a fat-finger 10x is blocked (reason "high")', () => {
  const r = priceBandCheck(500000, MARKET); // ₹5000 vs ₹250 ceiling
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'high');
});

test('band edges are inclusive', () => {
  assert.equal(priceBandCheck(1250, MARKET).ok, true); // exactly the floor
  assert.equal(priceBandCheck(25000, MARKET).ok, true); // exactly the ceiling
});

test('with no market reference, any positive price passes (only the ₹0 floor holds)', () => {
  assert.equal(priceBandCheck(999999, null).ok, true);
  assert.equal(priceBandCheck(1, 0).ok, true);
});

test('the block message names the market rate, the band, and the unit, in rupees', () => {
  const msg = priceBandMessage(priceBandCheck(500000, MARKET), 'kg');
  assert.match(msg, /₹50\.00/); // market rate
  assert.match(msg, /₹12\.50–₹250\.00/); // band
  assert.match(msg, /per kg/);
});
