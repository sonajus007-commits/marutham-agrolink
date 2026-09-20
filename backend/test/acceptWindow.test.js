// Unit tests for the acceptance-deadline math (utils/acceptWindow). Pure — no DB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeAcceptDeadline, ACCEPT_WINDOW_MS } = require('../utils/acceptWindow');

test('farmer: deadline = latest listing cutoff + 2h', () => {
  const now = new Date('2026-09-20T09:00:00Z');
  const early = '2026-09-20T12:00:00Z';
  const late = '2026-09-20T14:00:00Z';
  const d = computeAcceptDeadline({ sellerType: 'Farmer', listingCutoffs: [early, late], now });
  assert.equal(d.toISOString(), new Date(new Date(late).getTime() + ACCEPT_WINDOW_MS).toISOString());
});

test('farmer with no cutoff falls back to the next 8 AM IST + 2h', () => {
  // 09:00 UTC = 14:30 IST on the 20th, so the next 8 AM IST is the 21st (02:30 UTC).
  const now = new Date('2026-09-20T09:00:00Z');
  const d = computeAcceptDeadline({ sellerType: 'Farmer', listingCutoffs: [], now });
  const next8amIstUtc = new Date('2026-09-21T02:30:00Z'); // 08:00 IST = 02:30 UTC
  assert.equal(d.toISOString(), new Date(next8amIstUtc.getTime() + ACCEPT_WINDOW_MS).toISOString());
});

test('retailer: deadline = that day\'s shop close (IST) + 2h', () => {
  // 06:00 UTC = 11:30 IST on the 20th; shop closes 20:00 IST = 14:30 UTC same day.
  const now = new Date('2026-09-20T06:00:00Z');
  const d = computeAcceptDeadline({ sellerType: 'Retailer', shopCloseHour: 20, now });
  const close = new Date('2026-09-20T14:30:00Z'); // 20:00 IST
  assert.equal(d.toISOString(), new Date(close.getTime() + ACCEPT_WINDOW_MS).toISOString());
});

test('retailer with no shop hours falls back like a farmer', () => {
  const now = new Date('2026-09-20T06:00:00Z');
  const d = computeAcceptDeadline({ sellerType: 'Retailer', shopCloseHour: null, now });
  assert.ok(d instanceof Date && !Number.isNaN(d.getTime()));
});

test('ignores null / malformed cutoffs when picking the latest', () => {
  const now = new Date('2026-09-20T09:00:00Z');
  const good = '2026-09-20T13:00:00Z';
  const d = computeAcceptDeadline({ sellerType: 'Farmer', listingCutoffs: [null, 'nonsense', good], now });
  assert.equal(d.toISOString(), new Date(new Date(good).getTime() + ACCEPT_WINDOW_MS).toISOString());
});
