import { describe, it, expect } from 'vitest';
import { fmtMoney, fmtMoneyFull } from './format';

describe('fmtMoneyFull', () => {
  it('groups with Indian lakh/crore separators (2-2-3), not 3-3-3', () => {
    // The whole reason this exists: a revenue roll-up must be readable at a glance.
    expect(fmtMoneyFull(12345678.9)).toBe('₹1,23,45,678.90');
    expect(fmtMoneyFull(4084.9)).toBe('₹4,084.90');
  });

  it('always shows paise — a financial dashboard does not round silently', () => {
    expect(fmtMoneyFull(157.11)).toBe('₹157.11');
    expect(fmtMoneyFull(1000)).toBe('₹1,000.00');
    expect(fmtMoneyFull(0)).toBe('₹0.00');
  });

  it('takes RUPEES, never paise — the executive endpoint already converted', () => {
    // ₹4,084.90 of revenue must not render as ₹4,08,490.00.
    expect(fmtMoneyFull(4084.9)).toBe('₹4,084.90');
  });

  it('degrades to an em-dash rather than NaN', () => {
    expect(fmtMoneyFull(undefined)).toBe('—');
    expect(fmtMoneyFull('abc')).toBe('—');
  });

  it('differs from fmtMoney only in grouping — fmtMoney is left alone on purpose', () => {
    expect(fmtMoney(4084.9)).toBe('₹4084.90'); // ungrouped, 71 call sites
    expect(fmtMoneyFull(4084.9)).toBe('₹4,084.90');
  });
});
