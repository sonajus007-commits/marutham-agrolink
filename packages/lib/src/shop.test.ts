import { describe, it, expect } from 'vitest';
import {
  homepagePrice,
  productEmoji,
  HOME_DISTRICT,
  HOME_PRODUCT_LIMIT,
  offerPrice,
  offerInStock,
  sortedOffers,
  districtPriceRows,
  productJsonLd,
  type PublicListing,
} from './shop';

const product = (
  prices: Array<{ district?: string; market_price?: string | number }>,
  unit = 'kg',
) => ({ unit, product_district_prices: prices }) as Parameters<typeof homepagePrice>[0];

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
    expect(
      homepagePrice(product([{ district: 'PUDUKKOTTAI District', market_price: '35' }]))?.amount,
    ).toBe(35);
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
    expect(
      homepagePrice(product([{ district: 'Pudukkottai', market_price: '40.00' }]))?.amount,
    ).toBe(40);
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

/* ── Product detail page ──────────────────────────────────────────────────── */

const offer = (l: Partial<PublicListing>): PublicListing => ({
  farmer_price: '20.00',
  qty_available: 10,
  farmer: { district: 'Pudukkottai' },
  ...l,
});

describe('offerPrice', () => {
  it('reads farmer_price as RUPEES — a money-middleware field, not paise', () => {
    // A ₹20/kg offer must not render as ₹0.20.
    expect(offerPrice(offer({ farmer_price: '20.00' }))).toBe(20);
  });

  it('treats a missing, zero or unparseable price as no price', () => {
    expect(offerPrice(offer({ farmer_price: null }))).toBeNull();
    expect(offerPrice(offer({ farmer_price: 0 }))).toBeNull();
    expect(offerPrice(offer({ farmer_price: 'n/a' }))).toBeNull();
  });
});

describe('offerInStock', () => {
  it('needs both a price and quantity left', () => {
    expect(offerInStock(offer({}))).toBe(true);
    expect(offerInStock(offer({ qty_available: 0 }))).toBe(false);
    expect(offerInStock(offer({ qty_available: null }))).toBe(false);
    expect(offerInStock(offer({ farmer_price: null }))).toBe(false);
  });
});

describe('sortedOffers', () => {
  it('puts the cheapest offer first', () => {
    const out = sortedOffers([
      offer({ id: 'dear', farmer_price: '30' }),
      offer({ id: 'cheap', farmer_price: '18' }),
      offer({ id: 'mid', farmer_price: '25' }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['cheap', 'mid', 'dear']);
  });

  it('drops what a visitor cannot buy rather than greying it out', () => {
    const out = sortedOffers([
      offer({ id: 'sold-out', qty_available: 0 }),
      offer({ id: 'live' }),
      offer({ id: 'priceless', farmer_price: null }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['live']);
  });

  it('breaks a price tie on the larger quantity — likeliest to survive checkout', () => {
    const out = sortedOffers([
      offer({ id: 'small', farmer_price: '20', qty_available: 5 }),
      offer({ id: 'big', farmer_price: '20', qty_available: 50 }),
    ]);
    expect(out.map((o) => o.id)).toEqual(['big', 'small']);
  });

  it('survives null/undefined — the COMMON case: the reset job clears listed nightly', () => {
    expect(sortedOffers(null)).toEqual([]);
    expect(sortedOffers(undefined)).toEqual([]);
    expect(sortedOffers([])).toEqual([]);
  });
});

describe('districtPriceRows', () => {
  it('sorts alphabetically and drops priceless rows', () => {
    const rows = districtPriceRows({
      product_district_prices: [
        { district: 'Thanjavur', market_price: '39.00' },
        { district: 'Chennai', market_price: '0' },
        { district: 'Madurai', market_price: '48.00' },
        { district: '', market_price: '10' },
      ],
    });
    expect(rows).toEqual([
      { district: 'Madurai', amount: 48 },
      { district: 'Thanjavur', amount: 39 },
    ]);
  });

  it('survives a product with no prices', () => {
    expect(districtPriceRows({})).toEqual([]);
    expect(districtPriceRows({ product_district_prices: null })).toEqual([]);
  });
});

describe('productJsonLd', () => {
  const product = {
    name: 'Tomatoes',
    unit: 'kg',
    regional_name: 'தக்காளி',
    category: 'Vegetables',
  };

  it('marks the product in stock when someone is actually selling it', () => {
    const ld = productJsonLd({
      product,
      price: 40,
      listings: [offer({})],
      url: 'https://x/products/1',
    }) as any;
    expect(ld.offers.availability).toBe('https://schema.org/InStock');
    expect(ld.offers.price).toBe('40.00');
    expect(ld.offers.priceCurrency).toBe('INR');
    expect(ld.alternateName).toBe('தக்காளி');
  });

  it('marks it out of stock when every offer is sold out — the page must not lie', () => {
    const ld = productJsonLd({
      product,
      price: 40,
      listings: [offer({ qty_available: 0 })],
      url: 'https://x/products/1',
    }) as any;
    expect(ld.offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('emits NOTHING without a price — a bogus ₹0 is worse than no rich result', () => {
    expect(productJsonLd({ product, price: null, listings: [], url: 'https://x' })).toBeNull();
  });

  it('only claims a rating when there is one', () => {
    const withRating = productJsonLd({
      product: { ...product, avg_rating: '4.0' },
      price: 40,
      listings: [],
      url: 'https://x',
    }) as any;
    expect(withRating.aggregateRating.ratingValue).toBe('4.0');

    const without = productJsonLd({ product, price: 40, listings: [], url: 'https://x' }) as any;
    expect(without.aggregateRating).toBeUndefined();
  });
});
