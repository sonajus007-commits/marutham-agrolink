import { describe, it, expect } from 'vitest';
import { homepagePrice, productEmoji, HOME_DISTRICT, HOME_PRODUCT_LIMIT } from './shop';

const product = (prices: Array<{ district?: string; market_price?: string | number }>, unit = 'kg') =>
  ({ unit, product_district_prices: prices } as Parameters<typeof homepagePrice>[0]);

describe('homepagePrice', () => {
  it('quotes the home district when it is priced there', () => {
    const p = product([
      { district: 'Chennai', market_price: '90' },
      { district: 'Pudukkottai', market_price: '40' },
    ]);
    expect(homepagePrice(p)).toEqual({ amount: 40, unit: 'kg' });
  });

  it('matches the district loosely, as the legacy page did', () => {
    // "Pudukkottai District" / "pudukkottai" both hit.
    expect(homepagePrice(product([{ district: 'PUDUKKOTTAI District', market_price: '35' }]))?.amount).toBe(35);
  });

  it('falls back to any price rather than showing a product with none', () => {
    const p = product([{ district: 'Madurai', market_price: '55' }]);
    expect(homepagePrice(p)).toEqual({ amount: 55, unit: 'kg' });
  });

  it('returns null when there is no price at all — the caller decides', () => {
    expect(homepagePrice(product([]))).toBeNull();
    expect(homepagePrice({ unit: 'kg' } as Parameters<typeof homepagePrice>[0])).toBeNull();
  });

  it('treats a zero or unparseable price as no price', () => {
    expect(homepagePrice(product([{ district: 'Pudukkottai', market_price: 0 }]))).toBeNull();
    expect(homepagePrice(product([{ district: 'Pudukkottai', market_price: 'n/a' }]))).toBeNull();
  });

  it('reads market_price as RUPEES — it is a money-middleware field, not paise', () => {
    // A ₹40/kg tomato must not render as ₹0.40 (the paise trap that bites elsewhere).
    expect(homepagePrice(product([{ district: 'Pudukkottai', market_price: '40.00' }]))?.amount).toBe(40);
  });

  it('defaults the unit when the product has none', () => {
    const p = { product_district_prices: [{ district: 'Pudukkottai', market_price: '20' }] };
    expect(homepagePrice(p as Parameters<typeof homepagePrice>[0])?.unit).toBe('unit');
  });

  it('can be pointed at another district', () => {
    const p = product([
      { district: 'Chennai', market_price: '90' },
      { district: 'Pudukkottai', market_price: '40' },
    ]);
    expect(homepagePrice(p, 'Chennai')?.amount).toBe(90);
    expect(HOME_DISTRICT).toBe('Pudukkottai');
  });
});

describe('productEmoji', () => {
  it('matches on a substring of the name', () => {
    expect(productEmoji('Tomatoes')).toBe('🍅');
    expect(productEmoji('Country Brinjal')).toBe('🍆');
  });

  it('is case-insensitive', () => {
    expect(productEmoji('MANGO')).toBe('🥭');
  });

  it('prefers the specific match over the fallback', () => {
    expect(productEmoji('Green Chilli')).toBe('🌶️');
    expect(productEmoji('Green Chilli')).not.toBe('🌿');
  });

  it('falls back to a leaf for anything unrecognised', () => {
    expect(productEmoji('Kollu Millet')).toBe('🌿');
    expect(productEmoji('')).toBe('🌿');
    expect(productEmoji(null)).toBe('🌿');
  });
});

describe('HOME_PRODUCT_LIMIT', () => {
  it('matches the legacy homepage (10, then "View all")', () => {
    expect(HOME_PRODUCT_LIMIT).toBe(10);
  });
});
