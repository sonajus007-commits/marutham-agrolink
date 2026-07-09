const test = require('node:test');
const assert = require('node:assert/strict');
const { farmerPayoutPaise, groupPayouts, payoutByOrder } = require('../utils/payouts');

// Paise, as stored. The farmer is paid farmer_price, not the consumer price.
const item = (over) => ({ order_id: 'o1', farmer_id: 'f1', farmer_price: 2000, qty: 2, ...over });

test('farmerPayoutPaise', async (t) => {
  await t.test('sums price × qty in paise', () => {
    assert.equal(farmerPayoutPaise([item(), item({ farmer_price: 500, qty: 3 })]), 4000 + 1500);
  });
  await t.test('rounds each line to whole paise', () => {
    assert.equal(farmerPayoutPaise([item({ farmer_price: 5925, qty: 5.5 })]), Math.round(5925 * 5.5));
    assert.equal(Number.isInteger(farmerPayoutPaise([item({ farmer_price: 5925, qty: 5.5 })])), true);
  });
  await t.test('an empty or missing list is zero, not NaN', () => {
    assert.equal(farmerPayoutPaise([]), 0);
    assert.equal(farmerPayoutPaise(undefined), 0);
  });
  await t.test('missing fields are treated as zero, not NaN', () => {
    assert.equal(farmerPayoutPaise([{ order_id: 'o1' }]), 0);
  });
});

test('groupPayouts — one payout per (order, farmer)', async (t) => {
  const items = [
    item({ order_id: 'o1', farmer_id: 'f1', farmer_price: 1000, qty: 1 }),
    item({ order_id: 'o1', farmer_id: 'f1', farmer_price: 500, qty: 2 }),  // same pair, accumulates
    item({ order_id: 'o1', farmer_id: 'f2', farmer_price: 3000, qty: 1 }), // same order, other farmer
    item({ order_id: 'o2', farmer_id: 'f1', farmer_price: 700, qty: 1 }),
  ];
  const rows = groupPayouts(items);

  await t.test('produces one row per pair', () => {
    assert.equal(rows.length, 3);
  });
  await t.test('accumulates lines within a pair', () => {
    const r = rows.find((x) => x.order_id === 'o1' && x.farmer_id === 'f1');
    assert.equal(r.amount, 1000 + 1000);
  });
  await t.test('keeps two farmers on one order separate', () => {
    assert.equal(rows.find((x) => x.farmer_id === 'f2').amount, 3000);
  });
  await t.test('an empty list settles nothing', () => {
    assert.deepEqual(groupPayouts([]), []);
  });
});

// Regression: the farmer earnings screen summed `o.farmer_payout`, a column that
// does not exist, so "awaiting settlement" and "in-flight" were always ₹0.
test('payoutByOrder — what one farmer is owed on each order', async (t) => {
  const items = [
    item({ order_id: 'o1', farmer_price: 2940, qty: 2 }),
    item({ order_id: 'o1', farmer_price: 5925, qty: 1 }),
    item({ order_id: 'o2', farmer_price: 1000, qty: 3 }),
  ];
  const map = payoutByOrder(items);

  await t.test('sums this farmer\'s lines per order', () => {
    assert.equal(map.o1, 5880 + 5925);
    assert.equal(map.o2, 3000);
  });
  await t.test('agrees with what the settlement batch would pay', () => {
    const settled = groupPayouts(items).filter((r) => r.order_id === 'o1')[0];
    assert.equal(settled.amount, map.o1);
  });
  await t.test('an order with no items of ours is simply absent', () => {
    assert.equal(map.o3, undefined);
  });
  await t.test('is never NaN', () => {
    assert.equal(payoutByOrder([{ order_id: 'x' }]).x, 0);
  });
});
