import { describe, it, expect } from 'vitest';
import { fmtMoney, fmtMoneyInt } from './format';

describe('fmtMoney', () => {
  it('groups with Indian lakh/crore separators (2-2-3), not 3-3-3', () => {
    expect(fmtMoney(12345678.9)).toBe('₹1,23,45,678.90');
    expect(fmtMoney(128560)).toBe('₹1,28,560.00');
    expect(fmtMoney(4084.9)).toBe('₹4,084.90');
  });

  it('always shows paise, so a money column aligns and ₹63.5 never sits under ₹63.50', () => {
    expect(fmtMoney(63.5)).toBe('₹63.50');
    expect(fmtMoney(157.11)).toBe('₹157.11');
    expect(fmtMoney(1000)).toBe('₹1,000.00');
    expect(fmtMoney(0)).toBe('₹0.00');
  });

  it('parses the strings the backend actually sends', () => {
    // Money arrives from PostgREST as a numeric string, not a number.
    expect(fmtMoney('52.50')).toBe('₹52.50');
    expect(fmtMoney('4084.9')).toBe('₹4,084.90');
  });

  it('degrades to an em-dash rather than NaN — or a confident, wrong ₹0.00', () => {
    expect(fmtMoney(undefined)).toBe('—');
    expect(fmtMoney(null)).toBe('—');
    expect(fmtMoney('')).toBe('—');
    expect(fmtMoney('abc')).toBe('—');
  });

  it('takes RUPEES, never paise', () => {
    // ₹4,084.90 of revenue must not render as ₹4,08,490.00.
    expect(fmtMoney(4084.9)).toBe('₹4,084.90');
  });
});

describe('fmtMoneyInt', () => {
  it('rounds to whole rupees for tiles where paise are noise', () => {
    expect(fmtMoneyInt(1240)).toBe('₹1,240');
    expect(fmtMoneyInt(128560)).toBe('₹1,28,560');
  });
});
