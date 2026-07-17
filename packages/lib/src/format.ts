/* Framework-agnostic formatters — ported from frontend/js/shared.js.
 * Pure functions, safe to reuse from React web and React Native. */
import { statusPalette, statusFallback } from '@marutham/tokens';

/**
 * Money, everywhere: "₹52.50", "₹12,34,567.89".
 *
 * Backend returns money as strings like "52.50" (already rupees), hence the
 * parseFloat — `Number('')` is 0, which would print a confident ₹0.00 for a
 * missing value, where parseFloat gives NaN and we print an honest em-dash.
 *
 * Grouping is en-IN, so 2-2-3 (lakh/crore) rather than 3-3-3: ₹12,34,567.89.
 * Paise are always shown. A money column where some rows carry paise and others
 * do not does not align, and ₹63.5 sitting under ₹63.50 for the same figure
 * reads as two different numbers.
 */
export function fmtMoney(val: unknown): string {
  const n = parseFloat(String(val));
  if (isNaN(n)) return '—';
  return '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Money rounded to whole rupees, for tiles where the paise are noise: "₹1,240". */
export function fmtMoneyInt(val: unknown): string {
  return '₹' + Number(val || 0).toLocaleString('en-IN');
}

export function fmtNum(val: unknown): string {
  return Number(val || 0).toLocaleString('en-IN');
}

/**
 * The app language as a locale Intl will accept.
 *
 * The region matters and is not decoration: bare `'en'` formats the date as
 * "Jul 09, 2026", where `'en-IN'` gives "09 Jul 2026". Passing i18n.language
 * straight through would silently reorder every English date in the app, so the
 * two languages are mapped explicitly and anything unrecognised stays en-IN.
 */
export function dateLocale(lang?: string | null): string {
  return lang === 'ta' ? 'ta-IN' : 'en-IN';
}

/* `lang` is optional on both formatters, so the ~37 existing call sites keep the
 * exact output they have today and only the screens that pass it translate. */
export function fmtDate(isoStr?: string | null, lang?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString(dateLocale(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function fmtDateShort(isoStr?: string | null, lang?: string | null): string {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  return d.toLocaleDateString(dateLocale(lang), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
  /** Optional map pin for the delivery point, captured best-effort from the device
   *  (geolocation phase 3). Stored inline in the delivery_addresses JSONB. */
  lat?: number | null;
  lng?: number | null;
}

/** Join a structured address object into a single line. */
export function buildAddress(u: AddressObject): string {
  return [
    u.house_no,
    u.street1,
    u.street2,
    u.landmark,
    u.village_town,
    u.city,
    u.district,
    u.pincode,
    u.state,
  ]
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

/**
 * Translation key per order status — for DISPLAY only.
 *
 * The status VALUE stays English, and must: it is what the API sends, what
 * `statusColor` and `statusTone` key off, and what `buildPipeline` runs an
 * indexOf against to decide which stage an order has reached. Translate the
 * value and the pipeline breaks silently — indexOf returns -1 and every stage
 * renders `pending`. The string is the data; this is only how it is spoken.
 *
 * The same nine strings serve as both `status` and pipeline stage label, so one
 * map covers the pills, the progress bar and the timeline.
 */
const STATUS_KEYS: Record<string, string> = {
  'Order Placed': 'status.orderPlaced',
  Packaged: 'status.packaged',
  'VCO Verified': 'status.vcoVerified',
  'Picked Up': 'status.pickedUp',
  'In Transit': 'status.inTransit',
  'At Hub': 'status.atHub',
  'Out for Delivery': 'status.outForDelivery',
  Delivered: 'status.delivered',
  Cancelled: 'status.cancelled',
  // Not a status and not a pipeline stage — order_history carries it as a label
  // of its own, so the timeline needs it even though no pill ever shows it.
  'Agent Assigned': 'status.agentAssigned',
};

/**
 * The i18n key for a status, or the status itself when it has none.
 *
 * Pair it with the raw status as the default — `t(statusKey(s), s)` — so an
 * unrecognised status renders as whatever the API called it, not as a key.
 */
export function statusKey(status: string): string {
  return STATUS_KEYS[status] ?? status;
}

/** The statuses that carry a translation. Lets a test prove none was missed. */
export function translatedStatuses(): string[] {
  return Object.keys(STATUS_KEYS);
}

/* Payment method and status are stored English too, and are shown on every order
 * row, sheet and receipt. Same rule as the status: the value is the data, these
 * are only how it is spoken. "UPI" is kept as-is on purpose — it is the name the
 * audience actually uses, in either language. */
const PAY_METHOD_KEYS: Record<string, string> = {
  'Cash on Delivery': 'pay.cod',
  UPI: 'pay.upi',
  Card: 'pay.card',
};

const PAY_STATUS_KEYS: Record<string, string> = {
  pending: 'pay.pending',
  paid: 'pay.paid',
};

/** The i18n key for a payment method, or the method itself when it has none. */
export function payMethodKey(method: string): string {
  return PAY_METHOD_KEYS[method] ?? method;
}

/** The i18n key for a payment status, or the status itself when it has none. */
export function payStatusKey(status: string): string {
  return PAY_STATUS_KEYS[status] ?? status;
}

/* How a PAYOUT reached the seller. `payouts.method` stores a snake_case code
 * ("bank_transfer"), which the earnings screen was printing verbatim — so even
 * the English read "bank_transfer". A key map gives both languages a real word. */
const PAYOUT_METHOD_KEYS: Record<string, string> = {
  bank_transfer: 'payout.method.bankTransfer',
  upi: 'payout.method.upi',
  cash: 'payout.method.cash',
};

/** The i18n key for a payout method, or the raw code when it has none. */
export function payoutMethodKey(method: string): string {
  return PAYOUT_METHOD_KEYS[method] ?? method;
}

/* The account vocabularies the admin console lists people by. All three are
 * stored VALUES the API filters and sorts on — only ever spoken, never replaced.
 * An unlisted value renders as whatever the API called it. */
const USER_ROLE_KEYS: Record<string, string> = {
  consumer: 'user.role.consumer',
  farmer: 'user.role.farmer',
  admin: 'user.role.admin',
};

const USER_STATUS_KEYS: Record<string, string> = {
  active: 'user.status.active',
  suspended: 'user.status.suspended',
  blocked: 'user.status.blocked',
};

const SELLER_TYPE_KEYS: Record<string, string> = {
  Farmer: 'seller.farmer',
  Retailer: 'seller.retailer',
};

/** admin_role, as stored. `MANAGEMENT_ADMIN_ROLES` is the door to /admin/*, so a
 *  role missing here is spoken in English rather than hidden. */
const ADMIN_ROLE_KEYS: Record<string, string> = {
  'Head Office': 'adminRole.headOffice',
  'Board of Director': 'adminRole.boardOfDirector',
  'State Head': 'adminRole.stateHead',
  'Regional Manager': 'adminRole.regionalManager',
  'District Manager': 'adminRole.districtManager',
  'Hub Incharge': 'adminRole.hubIncharge',
  'Delivery Agent': 'adminRole.deliveryAgent',
  VCO: 'adminRole.vco',
};

/** The i18n key for a user role, or the role itself when it has none. */
export function userRoleKey(role: string): string {
  return USER_ROLE_KEYS[role] ?? role;
}

/** The i18n key for an account status, or the status itself when it has none. */
export function userStatusKey(status: string): string {
  return USER_STATUS_KEYS[status] ?? status;
}

/** The i18n key for a seller type, or the type itself when it has none. */
export function sellerTypeKey(type: string): string {
  return SELLER_TYPE_KEYS[type] ?? type;
}

/** The i18n key for an admin_role, or the role itself when it has none. */
export function adminRoleKey(role: string): string {
  return ADMIN_ROLE_KEYS[role] ?? role;
}

/**
 * The i18n key for a dashboard scope's name.
 *
 * `scope.name` is a MIX: usually real data (a district, a state, a village, an
 * agent's first name), but two of them the SERVER invents — "All Regions" and
 * "Unassigned". Only those two are ours to say; everything else passes through,
 * the same call as `addressLabelKey`.
 */
export function scopeNameKey(name: string): string {
  if (name === 'All Regions') return 'admin.scope.allRegions';
  if (name === 'Unassigned') return 'admin.scope.unassigned';
  return name;
}

/**
 * The i18n key for a delivery address's label.
 *
 * Almost every label is the USER's own word for the place ("Home", "Amma's") and
 * must pass through untouched. The exception is "Registered address", which the
 * SERVER invents (routes/orders.js) when an order captured no address of its own
 * and it falls back to the profile — that one is ours to say, and it was the only
 * English left on a Tamil delivery sheet.
 */
export function addressLabelKey(label: string): string {
  return label === 'Registered address' ? 'address.registered' : label;
}

/**
 * The semantic role an ORDER status belongs to. Each has a contrast-checked
 * Bg/Fg pair.
 *
 * Deliberately not `StatusTone`, which ./executive already owns for the
 * dashboards' green/amber/red revenue bands. Same idea, different domain, and
 * this one needs `info` — a band is never "in flight". Widening the shared union
 * to fit would hand a new case to every exhaustive switch over a district band.
 */
export type OrderStatusTone = 'success' | 'danger' | 'info' | 'warning' | 'neutral';

/**
 * The status as a semantic ROLE, for anything that draws it as a filled pill.
 *
 * `statusColor` is a FILL — the 4px bar down a card. Several of its hexes are
 * light (`Order Placed` is the brand sun yellow, `Packaged` is gold), so a pill
 * that used one as a background under white text would be unreadable: gold on
 * white measures 2.21:1, which is why tokens.ts pairs it with dark text rather
 * than `white`. A tone instead names a role, and every role carries a `<role>Bg`
 * tint with a `<role>Fg` ink that `check-contrast.mjs` asserts at AA.
 *
 * So: `statusColor` where it is a bar or a rule, `statusTone` where it is type on
 * a fill. Cancelled is checked by the CALLER (`isOrderCancelled`) — the flag is a
 * column, not a status string, and an order can carry it while `status` still
 * reads whatever stage it had reached.
 */
export function statusTone(status: string): OrderStatusTone {
  switch (status) {
    case 'Delivered':
      return 'success';
    case 'Cancelled':
      return 'danger';
    // Placed but not yet moving — the customer is waiting on us.
    case 'Order Placed':
    case 'Packaged':
      return 'warning';
    // In flight. Nothing is wrong and nothing is finished.
    case 'VCO Verified':
    case 'Picked Up':
    case 'Out for Delivery':
    case 'In Transit':
    case 'At Hub':
      return 'info';
    default:
      return 'neutral';
  }
}
