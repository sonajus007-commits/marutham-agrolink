// The arithmetic behind declining some lines of a parcel and accepting the rest.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { lineSums, moneyAfterDecline } = require('../utils/partialDecline');

describe('lineSums', () => {
  test('mirrors the placement maths per line (paise, rounded per line)', () => {
    const s = lineSums([
      { qty: 2, price: 5670, farmer_price: 5400, govt_price: 6000 }, // carrot
      { qty: 1.5, price: 2415, farmer_price: 2300, govt_price: null }, // potato, no govt price
    ]);
    assert.equal(s.line, 11340 + Math.round(2415 * 1.5));
    assert.equal(s.seller, 10800 + 3450);
    assert.equal(s.saved, (6000 - 5670) * 2);
  });
  test('a line priced above the govt rate saves nothing (never negative)', () => {
    assert.equal(lineSums([{ qty: 1, price: 7000, farmer_price: 6600, govt_price: 6000 }]).saved, 0);
  });
});

describe('moneyAfterDecline', () => {
  const order = { item_total: 20000, market_fee: 1000, saved: 900, total: 23500, handling: 1000, delivery: 2500 };
  test('only the declined goods come off; handling and delivery stay as charged', () => {
    const m = moneyAfterDecline(order, { line: 5670, seller: 5400, saved: 330 });
    assert.deepEqual(m, { item_total: 14330, market_fee: 730, saved: 570, total: 17830 });
    assert.equal(m.total - m.item_total, order.total - order.item_total); // charges unchanged
  });
  test('never goes negative on inconsistent input', () => {
    const m = moneyAfterDecline({ item_total: 100, market_fee: 0, saved: 0, total: 100 }, { line: 500, seller: 400, saved: 50 });
    assert.deepEqual(m, { item_total: 0, market_fee: 0, saved: 0, total: 0 });
  });
});
