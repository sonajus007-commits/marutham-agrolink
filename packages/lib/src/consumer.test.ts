import { describe, it, expect } from 'vitest';
import {
  cartBill,
  offerConsumerPrice,
  bestOffer,
  offersForSeller,
  offersByRating,
  filterProducts,
  unitStep,
  unitAllowsDecimal,
  FREE_DELIVERY_MIN,
  DELIVERY_FLAT,
  type CartItem,
  type Product,
  type Offer,
  type Rating,
} from './consumer';

const product = (over: Partial<Product> = {}): Product => ({
  id: 'p1',
  name: 'Brinjal',
  unit: 'kg',
  platform_fee_pct: 5,
  district_price: { handling: '0', market_price: '35', consumer_price: '30' },
  ...over,
});

const line = (over: Partial<CartItem> = {}): CartItem => ({
  product_id: 'p1',
  product_name: 'Brinjal',
  unit: 'kg',
  price: 30,
  qty: 1,
  ...over,
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
    const bill = cartBill(
      [line({ farmer_id: 'f1' }), line({ product_id: 'p2', farmer_id: 'f1' })],
      byId,
    );
    expect(bill.marketFee).toBe(0);
  });

  it('charges a flat ₹10 once the cart spans two farmers', () => {
    const bill = cartBill(
      [line({ farmer_id: 'f1' }), line({ product_id: 'p2', farmer_id: 'f2' })],
      byId,
    );
    expect(bill.marketFee).toBe(10);
  });

  it('stays flat at three farmers', () => {
    const bill = cartBill(
      [
        line({ farmer_id: 'f1' }),
        line({ product_id: 'p2', farmer_id: 'f2' }),
        line({ farmer_id: 'f3' }),
      ],
      byId,
    );
    expect(bill.marketFee).toBe(10);
  });

  it('ignores lines with no farmer', () => {
    const bill = cartBill(
      [line({ farmer_id: null }), line({ product_id: 'p2', farmer_id: null })],
      byId,
    );
    expect(bill.marketFee).toBe(0);
  });
});

describe('cartBill — handling and savings', () => {
  it('charges handling once, at the highest exotic rate', () => {
    const byId = {
      p1: product({ exotic: true, district_price: { handling: '5', market_price: '35' } }),
      p2: product({
        id: 'p2',
        exotic: true,
        district_price: { handling: '8', market_price: '35' },
      }),
    };
    const bill = cartBill([line({ price: 35 }), line({ product_id: 'p2', price: 38 })], byId);
    expect(bill.handling).toBe(8);
  });

  it('charges no handling for non-exotic items', () => {
    const byId = {
      p1: product({ exotic: false, district_price: { handling: '5', market_price: '35' } }),
    };
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

  // The fallback uses the SELLER's fee. `product.platform_fee_pct` is ignored —
  // the server never reads it, and it says 5% even for Retailers who pay 10%.
  // This test previously asserted the opposite, and so pinned the bug in place.
  it('ignores product.platform_fee_pct when falling back', () => {
    const p = product({
      platform_fee_pct: 10,
      district_price: { handling: '0', market_price: '35' },
    });
    const offer = {
      farmer_price: '20',
      consumer_price: null,
      farmer: { seller_type: 'Farmer' },
    } as Offer;
    expect(offerConsumerPrice(offer, p)).toBeCloseTo(21); // 20 + 5%, not + 10%
  });

  it('falls back to 5% for a farmer', () => {
    const p = product({
      platform_fee_pct: undefined,
      district_price: { handling: '0', market_price: '35' },
    });
    const offer = {
      farmer_price: '100',
      consumer_price: null,
      farmer: { seller_type: 'Farmer' },
    } as Offer;
    expect(offerConsumerPrice(offer, p)).toBeCloseTo(105);
  });

  it('falls back to 10% for a retailer', () => {
    const p = product({
      platform_fee_pct: 5,
      district_price: { handling: '0', market_price: '35' },
    });
    const offer = {
      farmer_price: '100',
      consumer_price: null,
      farmer: { seller_type: 'Retailer' },
    } as Offer;
    expect(offerConsumerPrice(offer, p)).toBeCloseTo(110);
  });

  it('treats a seller with no seller_type as a farmer', () => {
    const p = product({ district_price: { handling: '0', market_price: '35' } });
    const offer = { farmer_price: '100', consumer_price: null } as Offer;
    expect(offerConsumerPrice(offer, p)).toBeCloseTo(105);
  });
});

describe('bestOffer', () => {
  const cheap = {
    id: 'a',
    farmer_price: '10',
    consumer_price: 1000,
    farmer: { seller_type: 'Farmer' },
  } as Offer;
  const dear = {
    id: 'b',
    farmer_price: '20',
    consumer_price: 2000,
    farmer: { seller_type: 'Retailer' },
  } as Offer;

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

describe('filterProducts — only confirmed-for-selling products show', () => {
  const tomato = product({ id: 'tom', name: 'Tomato', product_group: 'Vegetables' });
  const brinjal = product({ id: 'brj', name: 'Brinjal', product_group: 'Vegetables' });
  const anOffer = { id: 'o1', farmer_price: '10', farmer: { seller_type: 'Farmer' } } as Offer;
  const noFilter = {
    group: 'All',
    cat: 'All',
    sub: 'All',
    seller: 'All',
    city: '',
    search: '',
  } as const;

  it('hides a product no seller has a live offer for', () => {
    const out = filterProducts([tomato, brinjal], { tom: [anOffer] }, { ...noFilter });
    expect(out.map((p) => p.id)).toEqual(['tom']); // brinjal has no offer → dropped
  });

  it('keeps hiding an offer-less product even under a matching search', () => {
    const out = filterProducts([brinjal], {}, { ...noFilter, search: 'brinj' });
    expect(out).toEqual([]);
  });

  it('shows a product once it has at least one offer', () => {
    const out = filterProducts([brinjal], { brj: [anOffer] }, { ...noFilter, search: 'brinj' });
    expect(out.map((p) => p.id)).toEqual(['brj']);
  });
});

describe('offersByRating — sellers ordered for rating-based selection', () => {
  const mk = (id: string, farmerId: string, price: number): Offer =>
    ({ id, farmer_price: String(price), farmer: { id: farmerId, seller_type: 'Farmer' } }) as Offer;
  const rated = (avg: number, n = 3): Rating => ({ avg_rating: avg, num_ratings: n });

  it('puts the highest-rated seller first and unrated sellers last', () => {
    const offers = [mk('a', 'f1', 10), mk('b', 'f2', 20), mk('c', 'f3', 30)];
    const ratings = { f1_p1: rated(3.0), f2_p1: rated(4.8) }; // f3 unrated
    const out = offersByRating(offers, ratings, 'p1').map((o) => o.id);
    expect(out).toEqual(['b', 'a', 'c']);
  });

  it('breaks a rating tie by cheaper price and does not mutate the input', () => {
    const offers = [mk('dear', 'f1', 30), mk('cheap', 'f2', 10)];
    const ratings = { f1_p1: rated(4.0), f2_p1: rated(4.0) };
    const out = offersByRating(offers, ratings, 'p1').map((o) => o.id);
    expect(out).toEqual(['cheap', 'dear']);
    expect(offers.map((o) => o.id)).toEqual(['dear', 'cheap']); // original order intact
  });

  it('treats a zero-count rating as unrated', () => {
    const offers = [mk('a', 'f1', 10), mk('b', 'f2', 20)];
    const ratings = { f1_p1: rated(5, 0), f2_p1: rated(2, 4) };
    expect(offersByRating(offers, ratings, 'p1').map((o) => o.id)).toEqual(['b', 'a']);
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
