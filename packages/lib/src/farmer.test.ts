import { describe, it, expect } from 'vitest';
import {
  projectConsumerPrice, projectBulkPrice, cutoffTimestamp, validateListing,
  CUTOFF_OPTIONS, MAX_BULK_DISC_PCT, type ListingDraft,
} from './farmer';
import { sellerFeePct, FARMER_FEE_PCT, RETAILER_FEE_PCT } from './fees';
import { offerConsumerPrice, type Offer, type Product } from './consumer';

describe('sellerFeePct — mirrors backend/utils/fees.js', () => {
  it('charges farmers 5%', () => {
    expect(sellerFeePct('Farmer')).toBe(FARMER_FEE_PCT);
    expect(FARMER_FEE_PCT).toBe(5);
  });

  it('charges retailers 10%', () => {
    expect(sellerFeePct('Retailer')).toBe(RETAILER_FEE_PCT);
    expect(RETAILER_FEE_PCT).toBe(10);
  });

  it('treats a legacy account with no seller_type as a farmer', () => {
    expect(sellerFeePct(undefined)).toBe(FARMER_FEE_PCT);
    expect(sellerFeePct(null)).toBe(FARMER_FEE_PCT);
    expect(sellerFeePct('')).toBe(FARMER_FEE_PCT);
  });
});

describe('projectConsumerPrice', () => {
  it('adds the farmer fee', () => {
    expect(projectConsumerPrice(100, 'Farmer').consumerPrice).toBe(105);
  });

  // Regression: the preview read products.platform_fee_pct (always 5) so a
  // Retailer was shown ₹105 while her customer was charged ₹110.
  it('adds the higher retailer fee', () => {
    const p = projectConsumerPrice(100, 'Retailer');
    expect(p.feePct).toBe(10);
    expect(p.consumerPrice).toBe(110);
  });

  it('adds handling on top of the fee, not inside it', () => {
    const p = projectConsumerPrice(100, 'Farmer', 8);
    expect(p.fee).toBe(5);
    expect(p.handling).toBe(8);
    expect(p.consumerPrice).toBe(113);
  });

  it('reports the seller\'s own price back unchanged', () => {
    expect(projectConsumerPrice(42.5, 'Farmer').farmerPrice).toBe(42.5);
  });
});

describe('projectBulkPrice', () => {
  it('discounts the seller price, then applies the fee', () => {
    const b = projectBulkPrice(100, 'Farmer', 10, 20)!;
    expect(b.farmerPrice).toBe(80); // 20% off
    expect(b.consumerPrice).toBe(84); // + 5%
    expect(b.bulkQty).toBe(10);
  });

  it('uses the retailer fee too', () => {
    expect(projectBulkPrice(100, 'Retailer', 10, 20)!.consumerPrice).toBe(88);
  });

  it('clamps the discount, as the server does', () => {
    expect(projectBulkPrice(100, 'Farmer', 5, 99)!.discPct).toBe(MAX_BULK_DISC_PCT);
  });

  it('is null when no bulk rule is set', () => {
    expect(projectBulkPrice(100, 'Farmer', 0, 20)).toBeNull();
    expect(projectBulkPrice(100, 'Farmer', 10, 0)).toBeNull();
    expect(projectBulkPrice(100, 'Farmer', null, null)).toBeNull();
  });
});

describe('offerConsumerPrice falls back to the seller fee, not platform_fee_pct', () => {
  const product = { id: 'p1', name: 'x', district_price: { handling: '0' }, platform_fee_pct: 5 } as Product;

  it('prefers the server-computed consumer_price (paise)', () => {
    const offer = { farmer_price: '100', consumer_price: 11000, farmer: { seller_type: 'Retailer' } } as Offer;
    expect(offerConsumerPrice(offer, product)).toBe(110);
  });

  it('a retailer offer without consumer_price falls back to 10%, not the product\'s 5%', () => {
    const offer = { farmer_price: '100', consumer_price: null, farmer: { seller_type: 'Retailer' } } as Offer;
    expect(offerConsumerPrice(offer, product)).toBeCloseTo(110); // 100 * 1.1 has float dust
  });

  it('a farmer offer falls back to 5%', () => {
    const offer = { farmer_price: '100', consumer_price: null, farmer: { seller_type: 'Farmer' } } as Offer;
    expect(offerConsumerPrice(offer, product)).toBeCloseTo(105);
  });
});

describe('cutoffTimestamp', () => {
  const at = (iso: string) => new Date(iso);

  it('resolves a label to the next occurrence of that hour', () => {
    const ts = cutoffTimestamp('8 PM (previous evening)', at('2026-07-09T10:00:00'))!;
    const d = new Date(ts);
    expect(d.getHours()).toBe(20);
    expect(d.getDate()).toBe(9);
  });

  it('rolls to tomorrow when the hour has already passed', () => {
    const ts = cutoffTimestamp('8 AM', at('2026-07-09T10:00:00'))!;
    expect(new Date(ts).getDate()).toBe(10);
  });

  it('rolls over at exactly the cutoff hour, never landing in the past', () => {
    const now = at('2026-07-09T08:00:00');
    const ts = cutoffTimestamp('8 AM', now)!;
    expect(new Date(ts).getTime()).toBeGreaterThan(now.getTime());
  });

  it('handles midnight', () => {
    expect(new Date(cutoffTimestamp('12 AM (midnight)', at('2026-07-09T10:00:00'))!).getHours()).toBe(0);
  });

  it('handles noon', () => {
    expect(new Date(cutoffTimestamp('12 PM (noon)', at('2026-07-09T10:00:00'))!).getHours()).toBe(12);
  });

  it('rejects a label it does not know, rather than guessing', () => {
    expect(cutoffTimestamp('whenever')).toBeNull();
    expect(cutoffTimestamp('')).toBeNull();
  });

  it('every offered option resolves', () => {
    CUTOFF_OPTIONS.forEach((o) => expect(cutoffTimestamp(o.label)).not.toBeNull());
  });
});

describe('validateListing', () => {
  const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
    product_id: 'p1', farmer_price: 30, qty_available: 10, time_available: '8 PM (previous evening)', ...over,
  });

  it('accepts a complete draft', () => {
    expect(validateListing(draft())).toBeNull();
  });

  it.each([
    ['no product', { product_id: '' }, /Select a product/],
    ['no price', { farmer_price: '' as const }, /selling price/],
    ['zero price', { farmer_price: 0 }, /selling price/],
    ['negative price', { farmer_price: -5 }, /selling price/],
    ['no quantity', { qty_available: 0 }, /quantity you have/],
    ['unknown cutoff', { time_available: 'sometime' }, /when orders should stop/],
  ])('rejects %s', (_why, over, re) => {
    expect(validateListing(draft(over as Partial<ListingDraft>))).toMatch(re);
  });

  it('a bulk offer needs both a quantity and a discount', () => {
    expect(validateListing(draft({ bulk_qty: 5 }))).toMatch(/both a quantity and a discount/);
    expect(validateListing(draft({ bulk_disc_pct: 10 }))).toMatch(/both a quantity and a discount/);
    expect(validateListing(draft({ bulk_qty: 5, bulk_disc_pct: 10 }))).toBeNull();
  });

  it('rejects a bulk discount above the server cap', () => {
    expect(validateListing(draft({ bulk_qty: 5, bulk_disc_pct: 95 }))).toMatch(/cannot exceed 90%/);
  });

  it('rejects a bulk quantity larger than the stock on hand', () => {
    expect(validateListing(draft({ qty_available: 4, bulk_qty: 5, bulk_disc_pct: 10 }))).toMatch(/more than you have/);
  });

  it('an order rule needs a type', () => {
    expect(validateListing(draft({ qty_value: 2 }))).toMatch(/minimum order or a pack size/);
    expect(validateListing(draft({ qty_value: 2, qty_type: 'MOQ' }))).toBeNull();
  });

  it('rejects an order rule bigger than the stock on hand', () => {
    expect(validateListing(draft({ qty_available: 1, qty_value: 5, qty_type: 'SPQ' }))).toMatch(/larger than the quantity/);
  });
});
