import { describe, it, expect } from 'vitest';
import { deliveryTier, deliveryCharge, fmtKm } from './delivery';
import { cartBill, type CartItem, type Product } from './consumer';

// Same cases as backend/test/deliveryFee.test.js — the two must agree.
describe('deliveryTier', () => {
  it('prices by straight-line slab', () => {
    expect(deliveryTier(0, true)).toEqual({ local: true });
    expect(deliveryTier(10, false)).toEqual({ local: true });
    expect(deliveryTier(10.1, true)).toEqual({ local: false, fee: 40 });
    expect(deliveryTier(30, true)).toEqual({ local: false, fee: 40 });
    expect(deliveryTier(45, true)).toEqual({ local: false, fee: 70 });
    expect(deliveryTier(60.1, true)).toEqual({ local: false, fee: 100 });
  });
  it('unmeasurable: local in the same district, farthest slab outside', () => {
    expect(deliveryTier(null, true)).toEqual({ local: true });
    expect(deliveryTier(null, false)).toEqual({ local: false, fee: 100 });
  });
});

describe('deliveryCharge', () => {
  const near = { farmerId: 'a', distanceKm: 5, sameDistrict: true, itemTotal: 150 };
  const far = { farmerId: 'b', distanceKm: 45, sameDistrict: false, itemTotal: 500 };
  it('local sellers share one ₹25, free at ₹400 of local items', () => {
    expect(deliveryCharge([near, { ...near, farmerId: 'c' }], 400, 25).total).toBe(25);
    expect(deliveryCharge([{ ...near, itemTotal: 400 }], 400, 25).total).toBe(0);
  });
  it('far parcels pay their slab, never free, and do not count toward ₹400', () => {
    const q = deliveryCharge([near, far], 400, 25);
    expect(q.localFee).toBe(25);
    expect(q.far).toEqual([{ farmerId: 'b', distanceKm: 45, fee: 70 }]);
    expect(q.total).toBe(95);
  });
});

describe('cartBill with a seller distance quote', () => {
  const byId: Record<string, Product> = { p1: { id: 'p1', name: 'Tomatoes' } };
  const item = (farmer_id: string, price: number): CartItem => ({
    product_id: 'p1',
    product_name: 'Tomatoes',
    price,
    qty: 1,
    farmer_id,
  });
  it('without a quote keeps the flat rule', () => {
    expect(cartBill([item('a', 100)], byId).delivery).toBe(25);
  });
  it('adds the far seller slab on top of the local charge', () => {
    const bill = cartBill([item('a', 100), item('b', 100)], byId, [
      { farmer_id: 'a', distance_km: 3, same_district: true },
      { farmer_id: 'b', distance_km: 25, same_district: false },
    ]);
    expect(bill.delivery).toBe(65);
    expect(bill.total).toBe(200 + 10 + 65); // + multi-seller fee
  });
});

describe('fmtKm', () => {
  it('formats approximate km', () => {
    expect(fmtKm(3.24)).toBe('~3.2 km');
    expect(fmtKm(18.6)).toBe('~19 km');
    expect(fmtKm(null)).toBe('');
  });
});
