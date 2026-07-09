/* Address-book domain. The backend has no addresses endpoint: the book is a
 * `delivery_addresses` JSONB array on the users row, replaced wholesale by
 * PATCH /auth/me. So every "CRUD" operation is a pure array transformation
 * followed by one PATCH — which keeps all of it testable and RN-shareable.
 *
 * Every function returns a NEW array and never mutates its input, so callers
 * can send the result straight to the server and adopt whatever comes back. */
import type { AddressObject } from './format';

/** An entry in the user's saved address book. */
export type SavedAddress = AddressObject;

export const PINCODE_RE = /^\d{6}$/;

/**
 * Validate an address for saving. Mirrors the legacy consumer checks: enough of
 * a locality to find the door, a state + district for routing, a real pincode.
 * Returns a human-readable message, or null when the address is acceptable.
 */
export function validateAddress(a: SavedAddress): string | null {
  if (!a.street1?.trim() && !a.village_town?.trim()) return 'Enter at least a street or village.';
  if (!a.state || !a.district) return 'Select state and district.';
  if (!PINCODE_RE.test(a.pincode || '')) return 'A valid 6-digit pincode is required.';
  return null;
}

/** Compact one-line form used in lists and pickers (not the full postal line). */
export function addressSummary(a: SavedAddress): string {
  return [a.house_no, a.street1, a.landmark, a.village_town, a.pincode].filter(Boolean).join(', ');
}

/** Display name for an entry, falling back to its position. */
export function addressTitle(a: SavedAddress, index: number): string {
  return a.label || `Address ${index + 1}`;
}

/**
 * Guarantee the book's central invariant: a non-empty book has exactly one
 * default. Applied after every mutation so no caller can leave it inconsistent
 * (deleting the default used to leave a book with none).
 */
export function normalizeDefaults(list: SavedAddress[]): SavedAddress[] {
  if (list.length === 0) return [];
  const firstDefault = list.findIndex((a) => a.is_default);
  const winner = firstDefault >= 0 ? firstDefault : 0;
  return list.map((a, i) => (a.is_default === (i === winner) ? a : { ...a, is_default: i === winner }));
}

/** Add a new address, or replace the one at `index`. Preserves default-ness. */
export function upsertAddress(list: SavedAddress[], addr: SavedAddress, index: number | null): SavedAddress[] {
  if (index === null) return normalizeDefaults([...list, { ...addr, is_default: list.length === 0 }]);
  const next = list.slice();
  next[index] = { ...addr, is_default: list[index]?.is_default ?? false };
  return normalizeDefaults(next);
}

export function removeAddress(list: SavedAddress[], index: number): SavedAddress[] {
  return normalizeDefaults(list.filter((_, i) => i !== index));
}

export function setDefaultAddress(list: SavedAddress[], index: number): SavedAddress[] {
  return list.map((a, i) => ({ ...a, is_default: i === index }));
}

/** The entry the checkout should preselect, or null for an empty book. */
export function defaultAddressIndex(list: SavedAddress[]): number | null {
  if (list.length === 0) return null;
  const i = list.findIndex((a) => a.is_default);
  return i >= 0 ? i : 0;
}
