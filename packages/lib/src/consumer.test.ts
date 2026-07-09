import { describe, it, expect } from 'vitest';
import {
  cartBill, offerConsumerPrice, bestOffer, offersForSeller, unitStep, unitAllowsDecimal,
  FREE_DELIVERY_MIN, DELIVERY_FLAT, type CartItem, type Product, type Offer,
} from './consumer';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1', name: 'Brinjal', unit: 'kg', platform_fee_pct: 5,
  district_price: { handling: '0', market_price: '35', consumer_price: '30' },
  ...over,
});

const line = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 'p1', product_name: 'Brinjal', unit: 'kg', price: 30, qty: 1, ...over,
});

describe('cartBill — delivery threshold', () => {
  const byId = { p1: product() };

  it(`charges ₹${DELIVERY_FLAT} below the free-delivery threshold`, () => {
    const bill = cartBill([line({ qty: 1 })], byId); // ₹30
    expect(bill.delivery).toBe(DELIVERY_FLAT);
  });

  it('is free exactly at the threshold', () => {
    const bill = cartBill([line({ price: FREE_DELIVERY_MIN, qty: 1 })], byId);
    expect(bill.itemSubtotal).toBe(FREE_DELIVERY_MIN);
    expect(bill.delivery).toBe(0);
  });

  it('is free above the threshold', () => {
    expect(cartBill([line({ price: 200 })], byId).delivery).toBe(0);
  });

  it('an empty cart is charged nothing', () => {
    expect(cartBill([], byId)).toMatchObject({ itemSubtotal: 0, delivery: 0, total: 0 });
  });
});

describe('cartBill — multi-farmer market fee', () => {
  const byId = { p1: product(), p2: product({ id: 'p2', name: 'Tomato' }) };

  it('charges nothing when the cart has one farmer', () => {
    const bill = cartBill([line({ farmer_id: 'f1' }), line({ product_id: 'p2', farmer_id: 'f1' })], byId);
    expect(bill.marketFee).toBe(0);
  });

  it('charges a flat ₹10 once the cart spans two farmers', () => {
    const bill = cartBill([line({ farmer_id: 'f1' }), line({ product_id: 'p2', farmer_id: 'f2' })], byId);
    expect(bill.marketFee).toBe(10);
  });

  it('stays flat at three farmers', () => {
    const bill = cartBill(
      [line({ farmer_id: 'f1' }), line({ product_id: 'p2', farmer_id: 'f2' }), line({ farmer_id: 'f3' })],
      byId,
    );
    expect(bill.marketFee).toBe(10);
  });

  it('ignores lines with no farmer', () => {
    const bill = cartBill([line({ farmer_id: null }), line({ product_id: 'p2', farmer_id: null })], byId);
    expect(bill.marketFee).toBe(0);
  });
});

describe('cartBill — handling and savings', () => {
  it('charges handling once, at the highest exotic rate', () => {
    const byId = {
      p1: product({ exotic: true, district_price: { handling: '5', market_price: '35' } }),
      p2: product({ id: 'p2', exotic: true, district_price: { handling: '8', market_price: '35' } }),
    };
    const bill = cartBill([line({ price: 35 }), line({ product_id: 'p2', price: 38 })], byId);
    expect(bill.handling).toBe(8);
  });

  it('charges no handling for non-exotic items', () => {
    const byId = { p1: product({ exotic: false, district_price: { handling: '5', market_price: '35' } }) };
    expect(cartBill([line({ price: 35 })], byId).handling).toBe(0);
  });

  it('computes savings against market price, excluding handling', () => {
    const byId = { p1: product({ district_price: { handling: '0', market_price: '35' } }) };
    expect(cartBill([line({ price: 30, qty: 2 })], byId).savings).toBe(10); // (35-30) x 2
  });

  it('never reports a negative saving', () => {
    const byId = { p1: product({ district_price: { handling: '0', market_price: '20' } }) };
    expect(cartBill([line({ price: 30 })], byId).savings).toBe(0);
  });

  it('the total is the sum of its parts', () => {
    const byId = { p1: product() };
    const b = cartBill([line({ qty: 2 })], byId);
    expect(b.total).toBeCloseTo(b.itemSubtotal + b.handling + b.marketFee + b.delivery);
  });
});

describe('offerConsumerPrice', () => {
  it('prefers the seller-aware consumer_price, which the API sends in paise', () => {
    const p = product({ district_price: { handling: '2', market_price: '35' } });
    expect(offerConsumerPrice({ farmer_price: '20', consumer_price: 2500 } as Offer, p)).toBe(27); // 25 + 2
  });

  it('falls back to farmer price plus the platform fee', () => {
    const p = product({ platform_fee_pct: 10, district_price: { handling: '0', market_price: '35' } });
    expect(offerConsumerPrice({ farmer_price: '20', consumer_price: null } as Offer, p)).toBeCloseTo(22);
  });

  it('defaults the platform fee to 5% when the product does not set one', () => {
    const p = product({ platform_fee_pct: undefined, district_price: { handling: '0', market_price: '35' } });
    expect(offerConsumerPrice({ farmer_price: '100', consumer_price: null } as Offer, p)).toBeCloseTo(105);
  });
});

describe('bestOffer', () => {
  const cheap = { id: 'a', farmer_price: '10', consumer_price: 1000, farmer: { seller_type: 'Farmer' } } as Offer;
  const dear = { id: 'b', farmer_price: '20', consumer_price: 2000, farmer: { seller_type: 'Retailer' } } as Offer;

  it('picks the cheapest offer', () => {
    expect(bestOffer([dear, cheap])?.id).toBe('a');
  });

  it('respects the seller filter', () => {
    expect(bestOffer([dear, cheap], 'Retailer')?.id).toBe('b');
  });

  it('returns null when nothing matches', () => {
    expect(bestOffer([], 'Farmer')).toBeNull();
    expect(offersForSeller([cheap], 'Retailer')).toEqual([]);
  });
});

describe('quantity rules', () => {
  it.each(['kg', 'g', 'litre', 'ml', 'quintal', 'ton'])('%s allows halves', (unit) => {
    expect(unitAllowsDecimal(unit)).toBe(true);
    expect(unitStep(unit)).toBe(0.5);
  });

  it.each(['piece', 'dozen', 'packet', undefined])('%s is whole-number only', (unit) => {
    expect(unitAllowsDecimal(unit)).toBe(false);
    expect(unitStep(unit)).toBe(1);
  });
});
