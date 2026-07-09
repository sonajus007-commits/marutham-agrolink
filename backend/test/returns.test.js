// Run with: npm test  (node's built-in runner — no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RETURN_WINDOW_HOURS,
  isWithinReturnWindow,
  resolveReturnLines,
  deriveFullReturn,
  computeRefundPaise,
  buildReturnLineRows,
} = require('../utils/returns');

// A real order, in paise as the DB stores it: Brinjal ₹29.40 × 2, Green Chilli ₹59.25 × 5.5
const BRINJAL = { id: 'i1', product_code: 'p02', name: 'Brinjal', farmer_name: 'F', qty: 2, unit: 'kg', price: 2940 };
const CHILLI  = { id: 'i2', product_code: 'p03', name: 'Green Chilli', farmer_name: 'F', qty: 5.5, unit: 'kg', price: 5925 };
const ITEMS = [BRINJAL, CHILLI];
const ORDER = { item_total: 38468 }; // ₹384.68 as charged

const HOUR = 3600e3;

test('return window', async (t) => {
  const now = Date.parse('2026-07-09T12:00:00Z');
  await t.test('open just inside the window', () => {
    assert.equal(isWithinReturnWindow(new Date(now - 23 * HOUR).toISOString(), now), true);
  });
  await t.test('closed just outside it', () => {
    assert.equal(isWithinReturnWindow(new Date(now - (RETURN_WINDOW_HOURS + 1) * HOUR).toISOString(), now), false);
  });
  await t.test('an order never delivered is not returnable', () => {
    assert.equal(isWithinReturnWindow(null, now), false);
  });
  await t.test('an unparseable delivered_at is not returnable', () => {
    assert.equal(isWithinReturnWindow('not-a-date', now), false);
  });
});

test('resolveReturnLines matches lines to real order items', async (t) => {
  await t.test('by order_item_id (React app)', () => {
    const { resolved } = resolveReturnLines(ITEMS, [{ order_item_id: 'i1', qty: 2, reason: 'r' }]);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].item.name, 'Brinjal');
  });

  await t.test('by product_code (legacy consumer page)', () => {
    const { resolved } = resolveReturnLines(ITEMS, [{ product_code: 'p03', qty: 1, reason: 'r' }]);
    assert.equal(resolved[0].item.name, 'Green Chilli');
  });

  await t.test('by name, as a last resort', () => {
    const { resolved } = resolveReturnLines(ITEMS, [{ name: 'Brinjal', reason: 'r' }]);
    assert.equal(resolved[0].item.id, 'i1');
  });

  await t.test('empty lines means return everything, at full quantity', () => {
    const { resolved } = resolveReturnLines(ITEMS, [], 'whole order');
    assert.equal(resolved.length, 2);
    assert.deepEqual(resolved.map((r) => r.qty), [2, 5.5]);
    assert.equal(resolved[0].reason, 'whole order');
  });

  await t.test('omitted qty defaults to the full ordered quantity', () => {
    const { resolved } = resolveReturnLines(ITEMS, [{ order_item_id: 'i2', reason: 'r' }]);
    assert.equal(resolved[0].qty, 5.5);
  });

  await t.test('the client cannot smuggle in price, name or farmer', () => {
    const { resolved } = resolveReturnLines(ITEMS, [
      { order_item_id: 'i1', qty: 1, reason: 'r', price: '9999.00', name: 'Gold Bar', farmer_name: 'Me' },
    ]);
    assert.equal(resolved[0].item.price, 2940);
    assert.equal(resolved[0].item.name, 'Brinjal');
    assert.equal(resolved[0].item.farmer_name, 'F');
  });
});

test('resolveReturnLines rejects bad input', async (t) => {
  const bad = (lines, items = ITEMS) => resolveReturnLines(items, lines).error;

  await t.test('an item that is not in the order', () => {
    assert.match(bad([{ order_item_id: 'nope', reason: 'r' }]), /not part of this order/);
  });
  await t.test('quantity greater than what was purchased', () => {
    assert.match(bad([{ order_item_id: 'i1', qty: 99, reason: 'r' }]), /Invalid return quantity/);
  });
  await t.test('zero and negative quantities', () => {
    assert.match(bad([{ order_item_id: 'i1', qty: 0, reason: 'r' }]), /Invalid return quantity/);
    assert.match(bad([{ order_item_id: 'i1', qty: -1, reason: 'r' }]), /Invalid return quantity/);
  });
  await t.test('a non-numeric quantity', () => {
    assert.match(bad([{ order_item_id: 'i1', qty: 'two', reason: 'r' }]), /Invalid return quantity/);
  });
  await t.test('the same item listed twice', () => {
    assert.match(
      bad([{ order_item_id: 'i1', qty: 1, reason: 'r' }, { order_item_id: 'i1', qty: 1, reason: 'r' }]),
      /listed more than once/,
    );
  });
  await t.test('an order with no items', () => {
    assert.match(bad([{ order_item_id: 'i1' }], []), /no items to return/);
  });
});

test('deriveFullReturn is derived, never asserted by the caller', async (t) => {
  const all = resolveReturnLines(ITEMS, []).resolved;
  const partial = resolveReturnLines(ITEMS, [{ order_item_id: 'i1', qty: 2, reason: 'r' }]).resolved;
  const shortQty = resolveReturnLines(ITEMS, [
    { order_item_id: 'i1', qty: 2, reason: 'r' },
    { order_item_id: 'i2', qty: 1, reason: 'r' },
  ]).resolved;

  await t.test('every item at full quantity is a full return', () => {
    assert.equal(deriveFullReturn(ITEMS, all), true);
  });
  await t.test('a subset of items is not', () => {
    assert.equal(deriveFullReturn(ITEMS, partial), false);
  });
  await t.test('all items but one short on quantity is not', () => {
    assert.equal(deriveFullReturn(ITEMS, shortQty), false);
  });
});

test('computeRefundPaise — the ₹0.88 bug', async (t) => {
  await t.test('partial refund sums the stored paise price, not a rupee echo', () => {
    const resolved = resolveReturnLines(ITEMS, [{ order_item_id: 'i1', qty: 2, reason: 'r' }]).resolved;
    // Regression: the client used to send price "29.40" and this returned 88 paise (₹0.88).
    assert.equal(computeRefundPaise(ORDER, resolved, false), 5880); // ₹58.80
  });

  await t.test('a rupee price on the request cannot change the refund', () => {
    const resolved = resolveReturnLines(ITEMS, [
      { order_item_id: 'i1', qty: 2, reason: 'r', price: '29.40' },
    ]).resolved;
    assert.equal(computeRefundPaise(ORDER, resolved, false), 5880);
  });

  await t.test('full refund uses the order total actually charged', () => {
    const resolved = resolveReturnLines(ITEMS, []).resolved;
    assert.equal(computeRefundPaise(ORDER, resolved, true), 38468); // ₹384.68
  });

  await t.test('a full refund never re-sums the lines (no float drift)', () => {
    // 2940*2 + 5925*5.5 = 38467.5 → summing would round to 38468 here, but the
    // point is that item_total is authoritative even if the two ever disagree.
    const resolved = resolveReturnLines(ITEMS, []).resolved;
    assert.equal(computeRefundPaise({ item_total: 12345 }, resolved, true), 12345);
  });

  await t.test('fractional quantities round to whole paise', () => {
    const resolved = resolveReturnLines(ITEMS, [{ order_item_id: 'i2', qty: 5.5, reason: 'r' }]).resolved;
    assert.equal(computeRefundPaise(ORDER, resolved, false), Math.round(5925 * 5.5)); // 32588
    assert.equal(Number.isInteger(computeRefundPaise(ORDER, resolved, false)), true);
  });

  await t.test('multi-line partial refund adds up', () => {
    const resolved = resolveReturnLines(ITEMS, [
      { order_item_id: 'i1', qty: 1, reason: 'r' },
      { order_item_id: 'i2', qty: 2, reason: 'r' },
    ]).resolved;
    assert.equal(computeRefundPaise(ORDER, resolved, false), 2940 + 11850);
  });
});

test('buildReturnLineRows copies item details from order_items', async (t) => {
  const resolved = resolveReturnLines(ITEMS, [{ order_item_id: 'i2', qty: 5.5, reason: 'Damaged' }]).resolved;
  const rows = buildReturnLineRows('ret-1', resolved);

  await t.test('price is the integer paise column, not a rupee string', () => {
    assert.equal(rows[0].price, 5925);
    assert.equal(typeof rows[0].price, 'number');
  });
  await t.test('carries the fields return_lines requires', () => {
    assert.deepEqual(rows[0], {
      return_id: 'ret-1', product_code: 'p03', name: 'Green Chilli',
      farmer_name: 'F', qty: 5.5, unit: 'kg', price: 5925, reason: 'Damaged',
    });
  });
});
