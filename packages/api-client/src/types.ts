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

/* ── Seller profile change requests ─────────────────────────────────────────
 * Sensitive seller fields (bank/GST/business) are never written directly.
 * The seller submits the new values as a request; Head Office reviews it in the
 * admin portal and the approval applies it. Mirrors backend SENSITIVE_FIELDS in
 * routes/auth.js. See [[project-profile-change-requests]]. */
export const SENSITIVE_FIELDS = [
  'bank_name', 'bank_account', 'ifsc', 'gst_number', 'business_name', 'business_type',
] as const;
export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

export type ChangeRequestStatus =
  | 'pending' | 'approved' | 'rejected' | 'payment_pending' | (string & {});

export interface ProfileChangeRequest {
  id: string;
  status: ChangeRequestStatus;
  /** The field → new-value map the seller asked for. */
  requested_changes: Record<string, string> | null;
  requested_at?: string;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
  notes?: string | null;
}

export interface ProfileChangeRequestResponse {
  message: string;
  request: ProfileChangeRequest;
}

export interface MyChangeRequestsResponse {
  requests: ProfileChangeRequest[];
}

/* ── Admin Overview dashboard (GET /dashboard) ──────────────────────────────
 * Role-scoped by the server from the caller's admin_role. Money fields are
 * already in rupees (string, 2dp) — named to bypass the paise→rupee middleware. */
export interface DashboardKpis {
  total_orders: number;
  active_orders: number;
  delivered_orders: number;
  cancelled_orders: number;
  gmv_rupees: string;
  platform_fee_rupees: string;
  total_farmers: number;
  total_consumers: number;
  total_returns: number;
}

export interface DashboardTrendPoint {
  date: string;
  day_label: string;
  order_count: number;
  revenue: number;
}

export interface DashboardTopProduct {
  product_id: string;
  name: string;
  unit?: string;
  qty: number;
  revenue: number;
}

export interface DashboardSubscriptionSummary {
  active: number;
  expiring_soon: number;
  expired: number;
  by_plan: Record<string, number>;
}

export interface DashboardResponse {
  scope: string;
  kpis: DashboardKpis;
  /** status label → order count. */
  status_breakdown: Record<string, number>;
  daily_trend: DashboardTrendPoint[];
  top_products: DashboardTopProduct[];
  subscription_summary: DashboardSubscriptionSummary;
}

/* ── Admin user management ──────────────────────────────────────────────────
 * Account status. `suspended` = temporarily withheld (e.g. a seller who owes
 * their subscription); `blocked` = barred and needs a reason. */
export type AccountStatus = 'active' | 'suspended' | 'blocked';

export interface UserStatusHistoryEntry {
  id: string;
  old_status: string;
  new_status: string;
  reason: string | null;
  created_at: string;
  changer?: { fname?: string; lname?: string; login_id?: string } | null;
}
