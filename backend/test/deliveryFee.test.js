const { test } = require('node:test');
const assert = require('node:assert/strict');
const { distanceKm, deliveryTier, deliveryCharge, addressPin } = require('../utils/deliveryFee');

// Pudukkottai town → Tiruchirappalli town is ~50 km straight-line.
const PDK = { lat: 10.3797, lng: 78.8205 };
const TRY = { lat: 10.7905, lng: 78.7047 };

test('distanceKm: straight-line km to 1 decimal; null without both pins', () => {
  const km = distanceKm(PDK, TRY);
  assert.ok(km > 40 && km < 55, `got ${km}`);
  assert.equal(km, Math.round(km * 10) / 10);
  assert.equal(distanceKm(PDK, null), null);
  assert.equal(distanceKm({ lat: null, lng: 78 }, TRY), null);
  // Postgres numerics arrive as strings
  assert.equal(distanceKm({ lat: '10.3797', lng: '78.8205' }, PDK), 0);
});

test('deliveryTier: slabs by distance', () => {
  assert.deepEqual(deliveryTier({ distanceKm: 0 }), { local: true });
  assert.deepEqual(deliveryTier({ distanceKm: 10 }), { local: true });
  assert.deepEqual(deliveryTier({ distanceKm: 10.1 }), { local: false, fee: 4000 });
  assert.deepEqual(deliveryTier({ distanceKm: 30 }), { local: false, fee: 4000 });
  assert.deepEqual(deliveryTier({ distanceKm: 45 }), { local: false, fee: 7000 });
  assert.deepEqual(deliveryTier({ distanceKm: 60.1 }), { local: false, fee: 10000 });
  assert.deepEqual(deliveryTier({ distanceKm: 400 }), { local: false, fee: 10000 });
});

test('deliveryTier: unmeasurable → local in the same district, farthest slab outside it', () => {
  assert.deepEqual(deliveryTier({ distanceKm: null, sameDistrict: true }), { local: true });
  assert.deepEqual(deliveryTier({ distanceKm: null, sameDistrict: false }), { local: false, fee: 10000 });
});

test('deliveryCharge: all-local cart keeps the old rule (₹25 once, free at ₹400)', () => {
  const a = { farmerId: 'a', distanceKm: 3, itemTotal: 15000 };
  const b = { farmerId: 'b', distanceKm: 8, itemTotal: 10000 };
  assert.equal(deliveryCharge([a, b]).total, 2500); // one ₹25, not two
  assert.equal(deliveryCharge([a, { ...b, itemTotal: 25000 }]).total, 0); // ₹400 local → free
  assert.equal(deliveryCharge([]).total, 0);
});

test('deliveryCharge: far parcels add their own slab and are never free', () => {
  const near = { farmerId: 'a', distanceKm: 5, itemTotal: 50000 };
  const far = { farmerId: 'b', distanceKm: 45, itemTotal: 50000 };
  const q = deliveryCharge([near, far]);
  // ₹400 of LOCAL items → local free; the 45 km parcel still pays ₹70
  assert.equal(q.localFee, 0);
  assert.equal(q.total, 7000);
  // far items do not count toward the local free threshold
  const q2 = deliveryCharge([{ ...near, itemTotal: 10000 }, { ...far, itemTotal: 90000 }]);
  assert.equal(q2.total, 2500 + 7000);
  // two far sellers = two slab fees
  assert.equal(deliveryCharge([far, { ...far, farmerId: 'c', distanceKm: 20 }]).total, 7000 + 4000);
});

test('addressPin: numeric pin or null', () => {
  assert.deepEqual(addressPin({ lat: 10, lng: 78 }), { lat: 10, lng: 78 });
  assert.equal(addressPin({ lat: 10 }), null);
  assert.equal(addressPin(null), null);
});
