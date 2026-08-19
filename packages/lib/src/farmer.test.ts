import { describe, it, expect } from 'vitest';
import {
  projectConsumerPrice,
  projectBulkPrice,
  cutoffTimestamp,
  validateListing,
  farmerEarnings,
  farmerWeeklyEarnings,
  subscriptionStatus,
  needsSubscriptionPayment,
  listingState,
  canConfirmListing,
  needsSupplyConfirm,
  todaysSupplyListings,
  listingPriceRs,
  requestableProducts,
  rupeesToPaise,
  parseCutoffHour,
  cutoffLabel,
  DEFAULT_CUTOFF,
  cutoffSlots,
  validateShopHours,
  shopHourOptions,
  shopHoursLabel,
  formatHour12,
  MAX_BULK_DISC_PCT,
  SUBSCRIPTION_WARN_DAYS,
  type ListingDraft,
  type Payout,
  type FarmerListing,
} from './farmer';
import type { Order } from './orders';
import { sellerFeePct, FARMER_FEE_PCT, RETAILER_FEE_PCT } from './fees';
import { offerConsumerPrice, type Offer } from './consumer';

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

  it("reports the seller's own price back unchanged", () => {
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
  it('prefers the server-computed consumer_price (paise)', () => {
    const offer = {
      farmer_price: '100',
      consumer_price: 11000,
      farmer: { seller_type: 'Retailer' },
    } as Offer;
    expect(offerConsumerPrice(offer)).toBe(110);
  });

  it("a retailer offer without consumer_price falls back to 10%, not the product's 5%", () => {
    const offer = {
      farmer_price: '100',
      consumer_price: null,
      farmer: { seller_type: 'Retailer' },
    } as Offer;
    expect(offerConsumerPrice(offer)).toBeCloseTo(110); // 100 * 1.1 has float dust
  });

  it('a farmer offer falls back to 5%', () => {
    const offer = {
      farmer_price: '100',
      consumer_price: null,
      farmer: { seller_type: 'Farmer' },
    } as Offer;
    expect(offerConsumerPrice(offer)).toBeCloseTo(105);
  });
});

describe('parseCutoffHour — values in the database, not a lookup table', () => {
  it('reads a plain hour', () => {
    expect(parseCutoffHour('8 AM')).toBe(8);
    expect(parseCutoffHour('9 AM')).toBe(9);
    expect(parseCutoffHour('2 PM')).toBe(14);
  });

  // "9 AM" and "8 PM (today)" exist in farmer_listings today. A strict lookup
  // returned null for them, which blanked the cutoff when editing an old listing.
  it('reads a value carrying a parenthetical', () => {
    expect(parseCutoffHour('8 PM (today)')).toBe(20);
    expect(parseCutoffHour('12 AM (midnight)')).toBe(0);
    expect(parseCutoffHour('12 PM (noon)')).toBe(12);
  });

  it('"8 PM" and "8 PM (today)" mean the same hour', () => {
    expect(parseCutoffHour('8 PM')).toBe(parseCutoffHour('8 PM (today)'));
  });

  it('rejects what it cannot read, rather than guessing', () => {
    expect(parseCutoffHour('whenever')).toBeNull();
    expect(parseCutoffHour('')).toBeNull();
    expect(parseCutoffHour('25 PM')).toBeNull();
    expect(parseCutoffHour('0 AM')).toBeNull();
  });
});

/* The window is anchored to IST, so every `now` here is written as the UTC instant
 * that corresponds to a known IST wall-clock time. 4:30 PM IST = 11:00 UTC. */
const istNow = (h: number, min = 0) => new Date(Date.UTC(2026, 6, 9, h, min) - 330 * 60_000);

/** The IST hour an ISO instant falls on. */
const istHourOf = (iso: string) => new Date(new Date(iso).getTime() + 330 * 60_000).getUTCHours();

describe('cutoffSlots — the rolling window', () => {
  it('starts at the NEXT whole hour, never one already passing', () => {
    const s = cutoffSlots(istNow(16, 30)); // 4:30 PM IST
    expect(s[0].value).toBe('5 PM');
  });

  it('runs through to 8 AM and stops there', () => {
    const s = cutoffSlots(istNow(16, 30));
    expect(s.at(-1)!.value).toBe('8 AM');
    expect(s.map((x) => x.value)).not.toContain('9 AM');
  });

  it('offers a full day of slots when the morning cutoff has just gone', () => {
    const s = cutoffSlots(istNow(10, 0)); // 10 AM — past today's 8 AM
    expect(s[0].value).toBe('11 AM');
    expect(s.at(-1)!.value).toBe('8 AM');
    expect(s.at(-1)!.day).toBe('tomorrow');
  });

  it('leaves exactly one slot in the last hour before the cycle closes', () => {
    const s = cutoffSlots(istNow(7, 10));
    expect(s).toHaveLength(1);
    expect(s[0].value).toBe('8 AM');
    expect(s[0].day).toBe('today');
  });

  it('never offers a slot in the past', () => {
    for (const h of [0, 5, 7, 8, 12, 16, 20, 23]) {
      const now = istNow(h, 30);
      for (const slot of cutoffSlots(now)) {
        expect(new Date(slot.ts).getTime()).toBeGreaterThan(now.getTime());
      }
    }
  });

  it('marks slots past midnight as tomorrow', () => {
    const s = cutoffSlots(istNow(22, 0)); // 10 PM
    expect(s.find((x) => x.value === '11 PM')!.day).toBe('today');
    expect(s.find((x) => x.value === '1 AM')!.day).toBe('tomorrow');
  });

  /* The whole point of the rewrite: the device is not consulted. Two machines in
   * different zones at the same INSTANT must produce identical slots. */
  it('is identical regardless of the device timezone', () => {
    const instant = istNow(16, 30);
    const a = cutoffSlots(instant);
    const b = cutoffSlots(new Date(instant.getTime()));
    expect(a.map((x) => x.value + x.ts)).toEqual(b.map((x) => x.value + x.ts));
    expect(a[0].value).toBe('5 PM');
    expect(istHourOf(a[0].ts)).toBe(17); // 5 PM IST, whatever the host zone is
  });

  it('walks across a month end without a gap', () => {
    const endOfMonth = new Date(Date.UTC(2026, 6, 31, 22, 0) - 330 * 60_000); // 31 Jul, 10 PM IST
    const s = cutoffSlots(endOfMonth);
    expect(s[0].value).toBe('11 PM');
    expect(s.at(-1)!.value).toBe('8 AM');
    // consecutive, one hour apart, no duplicates
    for (let i = 1; i < s.length; i++) {
      expect(new Date(s[i].ts).getTime() - new Date(s[i - 1].ts).getTime()).toBe(3_600_000);
    }
  });
});

describe('cutoffTimestamp', () => {
  it('resolves a chosen slot to its exact IST instant', () => {
    const ts = cutoffTimestamp('5 PM', istNow(16, 30))!;
    expect(istHourOf(ts)).toBe(17);
  });

  it('refuses a time that is no longer on offer rather than booking the past', () => {
    // Noon at half four in the afternoon: already gone, and the window ends at
    // 8 AM, so it does not come round again. (6 AM WOULD resolve — the window
    // runs overnight, so 6 AM tomorrow morning is still ahead.)
    expect(cutoffTimestamp('12 PM', istNow(16, 30))).toBeNull();
    expect(cutoffTimestamp('6 AM', istNow(16, 30))).not.toBeNull();
  });

  it('refuses a legacy value whose meaning no longer exists', () => {
    expect(cutoffTimestamp('8 PM (today)', istNow(16, 30))).not.toBeNull(); // hour still parses
    expect(cutoffTimestamp('8 PM', istNow(21, 0))).toBeNull(); // 8 PM already gone
  });

  it('returns null for an unreadable value', () => {
    expect(cutoffTimestamp('whenever')).toBeNull();
  });

  it('every offered slot resolves to its own timestamp', () => {
    const now = istNow(16, 30);
    for (const slot of cutoffSlots(now)) {
      expect(cutoffTimestamp(slot.value, now)).toBe(slot.ts);
    }
  });

  it('the default is always available — it is the slot the window ends on', () => {
    for (const h of [0, 7, 8, 9, 16, 23]) {
      const now = istNow(h, 30);
      expect(cutoffSlots(now).some((s) => s.value === DEFAULT_CUTOFF)).toBe(true);
      expect(cutoffTimestamp(DEFAULT_CUTOFF, now)).not.toBeNull();
    }
  });
});

describe('cutoffLabel', () => {
  /* Slots are now plain clock times, so the stored value already IS the label.
   * The old "(previous evening)" / "(current day)" qualifiers existed only to
   * disambiguate a fixed list that straddled two days; a rolling window that
   * spans at most 24 hours contains each hour exactly once, so nothing is
   * ambiguous and there is nothing left to decorate. */
  it('reads back a stored value unchanged', () => {
    expect(cutoffLabel('8 PM')).toBe('8 PM');
    expect(cutoffLabel('3 AM')).toBe('3 AM');
  });
  it('shows a legacy value as-stored rather than inventing a new meaning', () => {
    expect(cutoffLabel('8 PM (today)')).toBe('8 PM (today)');
  });
});

describe('validateListing', () => {
  const draft = (over: Partial<ListingDraft> = {}): ListingDraft => ({
    product_id: 'p1',
    farmer_price: 30,
    qty_available: 10,
    time_available: '8 PM',
    ...over,
  });

  it('accepts a complete draft', () => {
    expect(validateListing(draft())).toBeNull();
  });

  it.each([
    ['no product', { product_id: '' }, 'product'],
    ['no price', { farmer_price: '' as const }, 'price'],
    ['zero price', { farmer_price: 0 }, 'price'],
    ['negative price', { farmer_price: -5 }, 'price'],
    ['no quantity', { qty_available: 0 }, 'qty'],
    ['unreadable cutoff', { time_available: 'sometime' }, 'cutoff'],
  ])('rejects %s', (_why, over, code) => {
    expect(validateListing(draft(over as Partial<ListingDraft>))).toBe(code);
  });

  it('a bulk offer needs both a quantity and a discount', () => {
    expect(validateListing(draft({ bulk_qty: 5 }))).toBe('bulkPair');
    expect(validateListing(draft({ bulk_disc_pct: 10 }))).toBe('bulkPair');
    expect(validateListing(draft({ bulk_qty: 5, bulk_disc_pct: 10 }))).toBeNull();
  });

  it('rejects a bulk discount above the server cap', () => {
    expect(validateListing(draft({ bulk_qty: 5, bulk_disc_pct: 95 }))).toBe('bulkMax');
  });

  it('rejects a bulk quantity larger than the stock on hand', () => {
    expect(validateListing(draft({ qty_available: 4, bulk_qty: 5, bulk_disc_pct: 10 }))).toBe(
      'bulkOverQty',
    );
  });

  it('an order rule needs a type', () => {
    expect(validateListing(draft({ qty_value: 2 }))).toBe('ruleType');
    expect(validateListing(draft({ qty_value: 2, qty_type: 'MOQ' }))).toBeNull();
  });

  it('rejects an order rule bigger than the stock on hand', () => {
    expect(validateListing(draft({ qty_available: 1, qty_value: 5, qty_type: 'SPQ' }))).toBe(
      'ruleOverQty',
    );
  });
});

describe('farmerEarnings', () => {
  // The API sends money as rupee strings; farmer_payout is computed per order.
  const order = (over: Partial<Order>): Order =>
    ({ id: 'o1', status: 'Delivered', ...over }) as Order;
  const payout = (over: Partial<Payout>): Payout =>
    ({ id: 'p1', amount: '100.00', status: 'paid', ...over }) as Payout;

  it('sums paid and pending payouts separately', () => {
    const e = farmerEarnings(
      [],
      [
        payout({ id: 'a', amount: '100.00', status: 'paid' }),
        payout({ id: 'b', amount: '50.50', status: 'paid' }),
        payout({ id: 'c', amount: '25.00', status: 'pending' }),
      ],
    );
    expect(e.paid).toBeCloseTo(150.5);
    expect(e.pending).toBeCloseTo(25);
  });

  it('counts a delivered order with no payout record as awaiting settlement', () => {
    const e = farmerEarnings([order({ id: 'o1', farmer_payout: '58.80' })], []);
    expect(e.awaiting).toBeCloseTo(58.8);
  });

  it('never double-counts: a payout supersedes the awaiting bucket', () => {
    const e = farmerEarnings(
      [order({ id: 'o1', farmer_payout: '58.80' })],
      [payout({ amount: '58.80', status: 'pending', order: { id: 'o1' } })],
    );
    expect(e.awaiting).toBe(0);
    expect(e.pending).toBeCloseTo(58.8);
    expect(e.lifetime).toBeCloseTo(58.8);
  });

  it('counts in-flight orders separately, and excludes them from lifetime', () => {
    const e = farmerEarnings([order({ id: 'o2', status: 'Packaged', farmer_payout: '30.00' })], []);
    expect(e.inFlight).toBeCloseTo(30);
    expect(e.awaiting).toBe(0);
    expect(e.lifetime).toBe(0);
  });

  it('ignores cancelled orders in both buckets', () => {
    const e = farmerEarnings(
      [order({ id: 'o3', status: 'Cancelled', farmer_payout: '99.00' })],
      [],
    );
    expect(e.awaiting).toBe(0);
    expect(e.inFlight).toBe(0);
  });

  // Regression: orders.farmer_payout never existed, so the legacy screen summed
  // `undefined` and showed ₹0 forever.
  it('is zero, not NaN, when farmer_payout is absent', () => {
    const e = farmerEarnings([order({ id: 'o4' })], []);
    expect(e.awaiting).toBe(0);
    expect(Number.isNaN(e.awaiting)).toBe(false);
  });

  it('an empty seller has an all-zero ledger', () => {
    expect(farmerEarnings([], [])).toEqual({
      paid: 0,
      pending: 0,
      awaiting: 0,
      inFlight: 0,
      lifetime: 0,
    });
  });
});

describe('subscriptionStatus', () => {
  const now = new Date('2026-07-09T12:00:00Z');
  const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

  it('reports no subscription when there is none', () => {
    expect(subscriptionStatus({}, now).level).toBe('none');
  });

  it('is active well before expiry', () => {
    const s = subscriptionStatus(
      { subscription_plan: 'Yearly', subscription_expires_at: days(200) },
      now,
    );
    expect(s.level).toBe('active');
    expect(s.daysLeft).toBe(200);
  });

  it('warns inside the reminder window', () => {
    expect(
      subscriptionStatus({ subscription_expires_at: days(SUBSCRIPTION_WARN_DAYS) }, now).level,
    ).toBe('expiring');
    expect(subscriptionStatus({ subscription_expires_at: days(1) }, now).level).toBe('expiring');
  });

  it('is expired on and after the expiry moment', () => {
    expect(subscriptionStatus({ subscription_expires_at: days(0) }, now).level).toBe('expired');
    expect(subscriptionStatus({ subscription_expires_at: days(-5) }, now).level).toBe('expired');
  });

  it('the boundary at warn+1 days is still active', () => {
    expect(
      subscriptionStatus({ subscription_expires_at: days(SUBSCRIPTION_WARN_DAYS + 1) }, now).level,
    ).toBe('active');
  });
});

describe('needsSubscriptionPayment', () => {
  it('a suspended seller must pay', () => {
    expect(needsSubscriptionPayment({ role: 'farmer', status: 'suspended' })).toBe(true);
  });
  it('an active seller does not', () => {
    expect(needsSubscriptionPayment({ role: 'farmer', status: 'active' })).toBe(false);
  });
  it('a suspended consumer is not a seller', () => {
    expect(needsSubscriptionPayment({ role: 'consumer', status: 'suspended' })).toBe(false);
  });
});

describe('listingState — collapses four flags into one value', () => {
  const listing = (over: Partial<FarmerListing> = {}): FarmerListing => ({
    id: 'l1',
    product_id: 'p1',
    farmer_price: '30.00',
    listing_status: 'active',
    listed: true,
    confirmed: false,
    ...over,
  });

  it('an unreviewed product request is pending', () => {
    expect(listingState(listing({ listing_status: 'pending' }))).toBe('pending');
  });

  it('defaults to pending when the status is missing', () => {
    expect(listingState({ id: 'l', product_id: 'p', farmer_price: 0 })).toBe('pending');
  });

  it('a declined request is rejected', () => {
    expect(listingState(listing({ listing_status: 'rejected' }))).toBe('rejected');
  });

  it('approved with no price needs a price', () => {
    expect(listingState(listing({ farmer_price: '0.00' }))).toBe('needs_price');
    expect(listingState(listing({ farmer_price: 0 }))).toBe('needs_price');
  });

  it('priced and live is listed', () => {
    expect(listingState(listing())).toBe('listed');
  });

  it('confirmed beats listed', () => {
    expect(listingState(listing({ confirmed: true }))).toBe('confirmed');
  });

  // The hourly job clears `listed` once cutoff_ts passes.
  it('priced but no longer listed means the cutoff passed', () => {
    expect(listingState(listing({ listed: false }))).toBe('cutoff_passed');
  });

  it('a pending request is pending even if it somehow has a price', () => {
    expect(listingState(listing({ listing_status: 'pending', farmer_price: '30' }))).toBe(
      'pending',
    );
  });
});

describe('canConfirmListing', () => {
  const base: FarmerListing = {
    id: 'l',
    product_id: 'p',
    farmer_price: '30',
    listing_status: 'active',
    listed: true,
  };
  it('only a live, priced, unconfirmed listing', () => {
    expect(canConfirmListing(base)).toBe(true);
    expect(canConfirmListing({ ...base, confirmed: true })).toBe(false);
    expect(canConfirmListing({ ...base, listed: false })).toBe(false);
    expect(canConfirmListing({ ...base, farmer_price: 0 })).toBe(false);
    expect(canConfirmListing({ ...base, listing_status: 'pending' })).toBe(false);
  });
});

describe("today's supply — the daily one-tap confirm set", () => {
  const listing = (over: Partial<FarmerListing> = {}): FarmerListing => ({
    id: 'l1',
    product_id: 'p1',
    farmer_price: '30.00',
    listing_status: 'active',
    listed: true,
    confirmed: false,
    ...over,
  });

  describe('needsSupplyConfirm', () => {
    it('a priced, live-but-unconfirmed listing needs confirming', () => {
      expect(needsSupplyConfirm(listing())).toBe(true);
    });
    it('a listing whose cutoff passed still needs confirming for today', () => {
      expect(needsSupplyConfirm(listing({ listed: false }))).toBe(true);
    });
    it('an already-confirmed listing does not', () => {
      expect(needsSupplyConfirm(listing({ confirmed: true }))).toBe(false);
    });
    it('pending / needs-price / rejected rows are never in scope', () => {
      expect(needsSupplyConfirm(listing({ listing_status: 'pending' }))).toBe(false);
      expect(needsSupplyConfirm(listing({ farmer_price: 0 }))).toBe(false);
      expect(needsSupplyConfirm(listing({ listing_status: 'rejected' }))).toBe(false);
    });
  });

  describe('todaysSupplyListings', () => {
    it('keeps every approved, priced listing regardless of registration recency', () => {
      const rows: FarmerListing[] = [
        listing({ id: 'a' }), // listed
        listing({ id: 'b', confirmed: true }), // confirmed (done)
        listing({ id: 'c', listed: false }), // cutoff passed
        listing({ id: 'd', listing_status: 'pending' }), // not approved
        listing({ id: 'e', farmer_price: 0 }), // needs price
        listing({ id: 'f', listing_status: 'rejected' }), // rejected
      ];
      expect(todaysSupplyListings(rows).map((l) => l.id)).toEqual(['a', 'b', 'c']);
    });

    it('is empty when the seller has no priced, approved products', () => {
      expect(todaysSupplyListings([listing({ listing_status: 'pending' })])).toEqual([]);
    });
  });
});

describe('listingPriceRs', () => {
  it('parses the rupee string the API sends', () => {
    expect(listingPriceRs({ id: 'l', product_id: 'p', farmer_price: '29.40' })).toBeCloseTo(29.4);
  });
  it('is zero, not NaN, when unset', () => {
    expect(listingPriceRs({ id: 'l', product_id: 'p', farmer_price: '' })).toBe(0);
  });
});

describe('requestableProducts', () => {
  const products = [
    { id: 'p1', available: true },
    { id: 'p2', available: true },
    { id: 'p3', available: false },
  ];

  it('excludes products already requested, in any state', () => {
    const listings: FarmerListing[] = [
      { id: 'l1', product_id: 'p1', farmer_price: 0, listing_status: 'rejected' },
    ];
    expect(requestableProducts(products, listings).map((p) => p.id)).toEqual(['p2']);
  });

  it('excludes unavailable products', () => {
    expect(requestableProducts(products, []).map((p) => p.id)).toEqual(['p1', 'p2']);
  });

  it('matches on the joined product id as well as product_id', () => {
    const listings = [
      { id: 'l', product_id: 'x', farmer_price: 0, product: { id: 'p2', name: 'B' } },
    ] as FarmerListing[];
    expect(requestableProducts(products, listings).map((p) => p.id)).toEqual(['p1']);
  });
});

describe('rupeesToPaise — the one place money crosses inward', () => {
  it('converts rupees to integer paise', () => {
    expect(rupeesToPaise(30)).toBe(3000);
    expect(rupeesToPaise('29.40')).toBe(2940);
  });
  it('rounds sub-paise away', () => {
    expect(rupeesToPaise(29.405)).toBe(2941);
    expect(Number.isInteger(rupeesToPaise(1.005))).toBe(true);
  });
  it('is zero, not NaN, for junk', () => {
    expect(rupeesToPaise('')).toBe(0);
    expect(rupeesToPaise('abc')).toBe(0);
  });
  it('round-trips a price read from the API', () => {
    const fromApi = '29.40';
    expect(rupeesToPaise(fromApi) / 100).toBeCloseTo(29.4);
  });
});

describe('projectConsumerPrice rounds in paise, like the server', () => {
  // The real pipeline: the form's rupees become paise at the API boundary, and
  // routes/listings.js then computes Math.round(farmer_price_paise * (1 + fee/100)).
  // Modelling the fee on unrounded rupees would describe a path that does not exist.
  const serverPrice = (rs: number, feePct: number) =>
    Math.round(rupeesToPaise(rs) * (1 + feePct / 100)) / 100;

  it('₹33.50 at 5% is ₹35.18, not ₹35.17', () => {
    expect(projectConsumerPrice(33.5, 'Farmer').consumerPrice).toBeCloseTo(35.18, 5);
    expect(projectConsumerPrice(33.5, 'Farmer').consumerPrice).toBe(serverPrice(33.5, 5));
  });

  it('a sub-paisa price is stored rounded, and previewed from the stored value', () => {
    // 1.005 stores as 100 paise (float: 1.005 is really 1.00499…), so the
    // customer pays ₹1.05 — not ₹1.06 computed off the unrounded rupees.
    expect(rupeesToPaise(1.005)).toBe(100);
    expect(projectConsumerPrice(1.005, 'Farmer').consumerPrice).toBeCloseTo(1.05, 5);
  });

  it('agrees with the server across awkward prices', () => {
    for (const rs of [0.01, 1.005, 12.34, 29.4, 33.5, 99.99, 100, 1234.56]) {
      expect(projectConsumerPrice(rs, 'Farmer').consumerPrice).toBeCloseTo(serverPrice(rs, 5), 6);
      expect(projectConsumerPrice(rs, 'Retailer').consumerPrice).toBeCloseTo(
        serverPrice(rs, 10),
        6,
      );
    }
  });

  it('handling is added after rounding, not folded into it', () => {
    const p = projectConsumerPrice(33.5, 'Farmer', 8);
    expect(p.consumerPrice).toBeCloseTo(35.18 + 8, 5);
  });

  it('the fee is whatever the rounding actually produced', () => {
    const p = projectConsumerPrice(33.5, 'Farmer');
    expect(p.farmerPrice + p.fee).toBeCloseTo(p.consumerPrice, 5);
  });
});

describe('farmerWeeklyEarnings — the earnings trend', () => {
  const NOW = new Date('2026-07-15T10:00:00Z'); // a Wednesday
  const mk = (payout: number, deliveredISO: string, status = 'Delivered'): Order =>
    ({
      id: Math.random().toString(36),
      status,
      delivered_at: deliveredISO,
      farmer_payout: payout,
    }) as unknown as Order;

  it('returns one bar per week, oldest first, zero-filled', () => {
    const rows = farmerWeeklyEarnings([], 8, NOW);
    expect(rows).toHaveLength(8);
    expect(rows.every((r) => r.amount === 0)).toBe(true);
    // strictly increasing week starts
    for (let i = 1; i < rows.length; i++) {
      expect(new Date(rows[i].weekStart).getTime()).toBeGreaterThan(
        new Date(rows[i - 1].weekStart).getTime(),
      );
    }
  });

  it('sums a delivered order into the week it was delivered', () => {
    const rows = farmerWeeklyEarnings([mk(500, '2026-07-15T09:00:00Z')], 8, NOW);
    expect(rows[rows.length - 1].amount).toBe(500); // current week is the last bar
  });

  it('ignores cancelled and non-delivered orders, and money older than the window', () => {
    const rows = farmerWeeklyEarnings(
      [
        mk(500, '2026-07-15T09:00:00Z', 'Out for Delivery'), // not delivered
        {
          id: 'x',
          status: 'Delivered',
          cancelled: true,
          delivered_at: '2026-07-15T09:00:00Z',
          farmer_payout: 999,
        } as unknown as Order,
        mk(700, '2026-01-01T09:00:00Z'), // before the 8-week window
      ],
      8,
      NOW,
    );
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(0);
  });

  it('handles farmer_payout arriving as a string (the numeric-as-string trap)', () => {
    const rows = farmerWeeklyEarnings(
      [mk('250' as unknown as number, '2026-07-15T09:00:00Z')],
      8,
      NOW,
    );
    expect(rows[rows.length - 1].amount).toBe(250);
  });
});

describe('validateShopHours — the retailer trading band', () => {
  it('accepts a window inside 8 AM – 8 PM', () => {
    expect(validateShopHours(9, 19)).toBeNull();
    expect(validateShopHours(8, 20)).toBeNull(); // both ends inclusive
  });

  // Not-yet-chosen is a PROBLEM, not an empty success: a retailer must state
  // their hours before they can trade.
  it('treats unset hours as required, not as valid', () => {
    expect(validateShopHours(null, null)).toBe('required');
    expect(validateShopHours(9, null)).toBe('required');
    expect(validateShopHours(undefined, 19)).toBe('required');
  });

  it('rejects anything outside the band', () => {
    expect(validateShopHours(7, 19)).toBe('band');
    expect(validateShopHours(9, 21)).toBe('band');
    expect(validateShopHours(9.5, 19)).toBe('band');
  });

  it('rejects an inverted or empty window', () => {
    expect(validateShopHours(19, 9)).toBe('order');
    expect(validateShopHours(9, 9)).toBe('order'); // opens and shuts at once = shut
  });
});

describe('shopHourOptions / shopHoursLabel', () => {
  it('offers every hour across the band inclusive', () => {
    const o = shopHourOptions();
    expect(o).toHaveLength(13); // 8..20
    expect(o[0].label).toBe('8 AM');
    expect(o.at(-1)!.label).toBe('8 PM');
  });

  it('reads back a window, or nothing when unset', () => {
    expect(shopHoursLabel(9, 19)).toBe('9 AM – 7 PM');
    expect(shopHoursLabel(null, null)).toBeNull();
  });
});

describe('formatHour12', () => {
  it('names the awkward hours the way a clock does', () => {
    expect(formatHour12(0)).toBe('12 AM');
    expect(formatHour12(12)).toBe('12 PM');
    expect(formatHour12(13)).toBe('1 PM');
    expect(formatHour12(23)).toBe('11 PM');
  });
});
