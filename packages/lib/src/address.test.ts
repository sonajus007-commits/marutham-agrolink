import { describe, it, expect } from 'vitest';
import {
  validateAddress, normalizeDefaults, upsertAddress, removeAddress,
  setDefaultAddress, defaultAddressIndex, addressSummary, addressTitle,
  type SavedAddress,
} from './address';

const addr = (label: string, is_default = false): SavedAddress => ({
  label, street1: '1 Main St', state: 'Tamil Nadu', district: 'Pudukkottai', pincode: '622001', is_default,
});
const defaults = (list: SavedAddress[]) => list.map((a) => !!a.is_default);

describe('validateAddress', () => {
  it('needs a street or a village to find the door', () => {
    expect(validateAddress({ state: 'TN', district: 'D', pincode: '622001' })).toMatch(/street or village/);
  });

  it('accepts a village with no street', () => {
    expect(validateAddress({ village_town: 'Vilakudi', state: 'TN', district: 'D', pincode: '622001' })).toBeNull();
  });

  it('needs a state and district for routing', () => {
    expect(validateAddress({ street1: 'x', state: 'TN', pincode: '622001' })).toMatch(/state and district/);
  });

  it.each(['62200', '6220012', '6220a1', '', undefined])('rejects the pincode %o', (pincode) => {
    expect(validateAddress({ street1: 'x', state: 'TN', district: 'D', pincode })).toMatch(/pincode/);
  });

  it('accepts a complete address', () => {
    expect(validateAddress(addr('Home'))).toBeNull();
  });

  it('treats whitespace-only street as absent', () => {
    expect(validateAddress({ street1: '   ', state: 'TN', district: 'D', pincode: '622001' })).toMatch(/street or village/);
  });
});

describe('normalizeDefaults — a non-empty book has exactly one default', () => {
  it('leaves an empty book empty', () => {
    expect(normalizeDefaults([])).toEqual([]);
  });

  it('promotes the first entry when none is marked', () => {
    expect(defaults(normalizeDefaults([addr('a'), addr('b')]))).toEqual([true, false]);
  });

  it('keeps only the first of several defaults', () => {
    expect(defaults(normalizeDefaults([addr('a', true), addr('b', true)]))).toEqual([true, false]);
  });

  it('preserves an existing default that is not first', () => {
    expect(defaults(normalizeDefaults([addr('a'), addr('b', true)]))).toEqual([false, true]);
  });
});

describe('upsertAddress', () => {
  it('makes the first address the default', () => {
    const book = upsertAddress([], addr('Home'), null);
    expect(book).toHaveLength(1);
    expect(book[0].is_default).toBe(true);
  });

  it('does not let a second address steal the default', () => {
    const book = upsertAddress([addr('Home', true)], addr('Work'), null);
    expect(defaults(book)).toEqual([true, false]);
  });

  it('an edit cannot promote itself to default', () => {
    const book = upsertAddress([addr('Home', true), addr('Work')], { ...addr('Work HQ'), is_default: true }, 1);
    expect(defaults(book)).toEqual([true, false]);
    expect(book[1].label).toBe('Work HQ');
  });

  it('does not mutate its input', () => {
    const original = [addr('Home', true)];
    upsertAddress(original, addr('Work'), null);
    expect(original).toHaveLength(1);
  });
});

describe('removeAddress', () => {
  const book = [addr('Home', true), addr('Work'), addr('Mum')];

  it('promotes the next entry when the default is deleted', () => {
    // Regression: the legacy page left a book with no default at all.
    const after = removeAddress(book, 0);
    expect(defaults(after)).toEqual([true, false]);
    expect(after[0].label).toBe('Work');
  });

  it('leaves the default alone when another entry is deleted', () => {
    expect(defaults(removeAddress(book, 1))).toEqual([true, false]);
  });

  it('deleting the only address empties the book', () => {
    expect(removeAddress([addr('only', true)], 0)).toEqual([]);
  });

  it('does not mutate its input', () => {
    removeAddress(book, 0);
    expect(book).toHaveLength(3);
  });
});

describe('setDefaultAddress', () => {
  const book = [addr('a', true), addr('b'), addr('c')];

  it('promotes one and demotes the rest', () => {
    expect(defaults(setDefaultAddress(book, 2))).toEqual([false, false, true]);
  });

  it('is idempotent', () => {
    expect(defaults(setDefaultAddress(setDefaultAddress(book, 1), 1))).toEqual([false, true, false]);
  });
});

describe('defaultAddressIndex', () => {
  it('finds the marked default', () => {
    expect(defaultAddressIndex([addr('a'), addr('b', true)])).toBe(1);
  });

  it('falls back to the first entry', () => {
    expect(defaultAddressIndex([addr('a'), addr('b')])).toBe(0);
  });

  it('is null for an empty book', () => {
    expect(defaultAddressIndex([])).toBeNull();
  });
});

describe('formatting', () => {
  it('summary skips blank parts', () => {
    expect(addressSummary({ house_no: '12', street1: 'Main St', pincode: '622001' })).toBe('12, Main St, 622001');
  });

  it('summary of an empty address is empty', () => {
    expect(addressSummary({})).toBe('');
  });

  it('title falls back to the position', () => {
    expect(addressTitle({}, 2)).toBe('Address 3');
  });

  it('title prefers the label', () => {
    expect(addressTitle({ label: 'Work' }, 0)).toBe('Work');
  });
});
