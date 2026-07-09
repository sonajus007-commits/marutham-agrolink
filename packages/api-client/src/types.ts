/* User shape — mirrors backend safeUser() (users row minus password_hash).
 * Only the commonly-used fields are typed; the index signature keeps the rest
 * accessible without fighting the compiler during the migration. */
export type UserRole = 'consumer' | 'farmer' | 'admin';

export type AdminRole =
  | 'Head Office'
  | 'State Head'
  | 'Regional Manager'
  | 'District Manager'
  | 'Hub Incharge'
  | 'VCO'
  | 'Delivery Agent'
  | (string & {});

export interface User {
  id: string;
  login_id: string;
  phone: string;
  role: UserRole;
  admin_role?: AdminRole | null;
  status: 'active' | 'suspended' | 'blocked';
  approval_status?: string | null;
  fname?: string | null;
  lname?: string | null;
  email?: string | null;
  district?: string | null;
  state?: string | null;
  emp_id?: string | null;
  /* Seller (farmer/retailer) fields. Money arrives as rupee strings. */
  seller_type?: 'Farmer' | 'Retailer' | null;
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
  subscription_amount?: string | null;
  registration_charge?: string | null;
  payment_confirmed_at?: string | null;
  /** Set by requireAuth: a suspended seller still owes their subscription. */
  needs_payment?: boolean;
  [key: string]: unknown;
}

export interface LoginResponse {
  message: string;
  token: string;
  user: User;
  needs_payment?: boolean;
}

export interface MeResponse {
  user: User;
}

/* ── Agent / orders ──────────────────────────────────────────────────────── */
export interface ScanResponse {
  message?: string;
  newStatus?: string;
}

export interface EligibleAgent {
  id: string;
  name: string;
  vehicle?: string;
}

export interface EligibleAgentsResponse {
  matched: EligibleAgent[];
  all: EligibleAgent[];
}

/** GET /orders/:id/track — live agent + ETA for the tracking card. */
export interface TrackAgent {
  name: string;
  phone?: string | null;
  vehicle?: string | null;
}

export interface TrackResponse {
  order: {
    id: string;
    code?: string;
    status: string;
    stage: number;
    route: string;
    cancelled?: boolean;
  };
  agent: TrackAgent | null;
  eta: string | null;
  routeMap: Array<{ step: number; label: string; status: 'done' | 'active' | 'pending' }>;
  timeline: Array<{ label: string; note?: string; ts?: string }>;
}

/**
 * One line of a return request.
 *
 * Deliberately carries no money and no item details: the server reads price,
 * name and farmer from order_items. Echoing back the rupee-converted `price`
 * from a GET response used to make the refund 100x too small, and let a client
 * name its own refund amount.
 */
export interface ReturnLine {
  /** order_items row id. */
  order_item_id: string;
  /** Defaults to the full ordered quantity; the server clamps to it. */
  qty?: number;
  reason: string;
}

export interface ReturnRequestPayload {
  lines: ReturnLine[];
  photos?: string[];
}

export interface ReturnResponse {
  message: string;
  return: { id: string; [key: string]: unknown };
  code: string;
}

export interface RateItemResponse {
  message: string;
  rating_value: number;
}

/* ── Seller: payouts + subscription ──────────────────────────────────────── */

/** Money fields arrive as rupee strings — see backend/utils/money.js. */
export interface SubscriptionPlan {
  name: string;
  days: number;
  /** Undiscounted price. Equals `amount` when no concession applies. */
  base_amount: string;
  amount: string;
}

export interface SubscriptionPlansResponse {
  plans: SubscriptionPlan[];
  /** Women & transgender concession, already applied to `amount`. */
  concession_pct: number;
  registration_charge: string;
  registration_charge_applies: boolean;
  current_status?: string;
  current_plan?: string | null;
  subscription_expires_at?: string | null;
}

export interface SubscriptionPayResponse {
  message: string;
  plan: string;
  plan_amount: string;
  registration_charge: string;
  amount_paid: string;
  payment_reference: string;
  subscription_expires_at: string;
  user: User;
}

export interface FieldDashboardResponse {
  role: string;
  stats: Record<string, number | string | null>;
  scope?: { name?: string };
  generated_at: string;
}

export interface Employee {
  emp_id?: string;
  designation?: string;
  department?: string;
  employment_type?: string;
  date_of_joining?: string;
  [key: string]: unknown;
}

export interface MyEmployeeResponse {
  employee: Employee | null;
}

/* ── Consumer storefront ─────────────────────────────────────────────────── */
export interface OrderingWindowResponse {
  ordering_window?: { open_hour: number; close_hour: number };
}

export interface TopRatingsResponse {
  top_ratings: Array<{
    product_id?: string;
    product?: { id: string };
    farmer?: { id: string };
    avg_rating: string | number;
    num_ratings: number;
  }>;
}

export interface LocationsResponse {
  tree: Record<string, Record<string, string[]>>;
}

export interface PlaceOrderItem {
  product_id: string;
  farmer_id?: string | null;
  qty: number;
}

export interface PlaceOrderPayload {
  items: PlaceOrderItem[];
  pay_method: string;
  delivery_fee: number;
  delivery_address?: Record<string, unknown> | null;
}
