// Locks the response redactor (utils/redact): the delivery OTP must never survive
// in a general payload, at any nesting depth, while the owner's `otp` field (a
// different key) passes through untouched.

const test = require('node:test');
const assert = require('node:assert/strict');
const { redact } = require('../utils/redact');

test('delivery_code is stripped from a top-level order', () => {
  const out = redact({ order: { id: 'o1', delivery_code: '4821', status: 'Delivered' } });
  assert.equal('delivery_code' in out.order, false);
  assert.equal(out.order.status, 'Delivered');
});

test('delivery_code is stripped inside arrays and nested parts', () => {
  const out = redact({
    orders: [
      { id: 'o1', delivery_code: '1111' },
      { id: 'o2', delivery_code: '2222', parts: [{ code: 'ORD1-1', delivery_code: '3333' }] },
    ],
  });
  assert.equal('delivery_code' in out.orders[0], false);
  assert.equal('delivery_code' in out.orders[1], false);
  assert.equal('delivery_code' in out.orders[1].parts[0], false);
});

test('the owner-facing `otp` key is left untouched', () => {
  const out = redact({ order: { id: 'o1' }, otp: '4821' });
  assert.equal(out.otp, '4821');
});

test('non-order payloads pass through unchanged', () => {
  const out = redact({ message: 'ok', count: 3, items: [{ name: 'Tomato' }] });
  assert.deepEqual(out, { message: 'ok', count: 3, items: [{ name: 'Tomato' }] });
});
