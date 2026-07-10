/* Framework-agnostic formatters — ported from frontend/js/shared.js.
 * Pure functions, safe to reuse from React web and React Native. */
import { statusPalette, statusFallback } from '@marutham/tokens';

/** Backend returns money as strings like "52.50" (already rupees). */
export function fmtMoney(val: unknown): string {
  const n = parseFloat(String(val));
  if (isNaN(n)) return '—';
  return '₹' + n.toFixed(2).replace(/\.00$/, '');
}

/** Compact integer money for tiles: "₹1,240". */
export function fmtMoneyInt(val: unknown): string {
  return '₹' + Number(val || 0).toLocaleString('en-IN');
}

export function fmtNum(val: unknown): string {
  return Number(val || 0).toLocaleString('en-IN');
}

export function fmtDate(isoStr?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtDateShort(isoStr?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* Every field is nullable: these columns come straight from Postgres, where an
 * unset address line is NULL rather than absent. Accepting null here means a
 * `users` row can be passed directly, with no lossy cast. */
export interface AddressObject {
  label?: string | null;
  phone?: string | null;
  house_no?: string | null;
  street1?: string | null;
  street2?: string | null;
  landmark?: string | null;
  village_town?: string | null;
  city?: string | null;
  taluk?: string | null;
  district?: string | null;
  pincode?: string | null;
  state?: string | null;
  /** Set on entries in a user's saved address book; exactly one is default. */
  is_default?: boolean;
}

/** Join a structured address object into a single line. */
export function buildAddress(u: AddressObject): string {
  return [u.house_no, u.street1, u.street2, u.landmark, u.village_town, u.city, u.district, u.pincode, u.state]
    .filter(Boolean)
    .join(', ');
}

/** Resolve a delivery_address that may be a plain string or a structured object. */
export function resolveAddress(da: string | AddressObject | null | undefined): string {
  if (!da) return '';
  return typeof da === 'object' ? buildAddress(da) : da;
}

export function statusColor(status: string): string {
  return (statusPalette as Record<string, string>)[status] ?? statusFallback;
}
