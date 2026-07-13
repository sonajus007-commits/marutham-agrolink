/* User shape — mirrors backend safeUser() (users row minus password_hash).
 * Only the commonly-used fields are typed; the index signature keeps the rest
 * accessible without fighting the compiler during the migration. */
import type { AuditEntry } from '@marutham/lib';

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

/** POST /auth/send-otp. `otp` is echoed back in the sandbox only (no SMS wired). */
export interface OtpSendResponse {
  message: string;
  otp?: string;
}

export interface MeResponse {
  user: User;
}

/* POST /auth/register (no auth). Consumers are created active and can sign in
 * straight away; farmers/retailers land in `pending_review` and surface in the
 * admin Registrations queue — they cannot log in until Head Office approves. */
export interface RegisterPayload {
  phone: string;
  password: string;
  role: 'consumer' | 'farmer';
  fname: string;
  lname?: string;
  email?: string;
  alt_phone?: string;
  gender?: string;
  country_code?: string;
  house_no?: string;
  street1?: string;
  street2?: string;
  landmark?: string;
  village_town?: string;
  city?: string;
  taluk?: string;
  district?: string;
  /** Mandatory, 6 digits — it drives delivery routing. */
  pincode: string;
  state?: string;
  country?: string;
  // Seller — required when role is 'farmer'
  seller_type?: 'Farmer' | 'Retailer';
  // Seller — Farmer
  aadhar?: string;
  bank_name?: string;
  bank_account?: string;
  ifsc?: string;
  // Seller — Retailer (business_name required for this type)
  business_name?: string;
  gst_number?: string;
  business_type?: string;
  /** Plan name from the catalogue; the seller pays for it after approval. */
  subscription_plan?: string;
}

export interface RegisterResponse {
  message: string;
  login_id: string;
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
  /** The consumer's delivery village — what `matched` was matched ON. */
  village?: string | null;
  leg?: string;
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

/* ── Admin returns queue (GET /returns, role-scoped server-side) ─────────────
 * `refund_amt` is a backend money field → arrives as a RUPEE string. `decision`
 * is null until an admin accepts/rejects; `collected` gates the refund. */
export interface AdminReturn {
  id: string;
  code: string;
  full_return: boolean;
  decision: 'accepted' | 'rejected' | null;
  collected: boolean;
  refund_amt: string | number;
  refund_to?: string | null;
  requested_at?: string;
  decided_at?: string | null;
  order?: {
    id: string;
    code?: string | null;
    consumer_name?: string | null;
    village?: string | null;
    district?: string | null;
  } | null;
}

export interface AdminReturnsResponse {
  returns: AdminReturn[];
}

/* ── Admin payouts (GET /payouts, role-scoped server-side) ───────────────────
 * `amount` is a backend money field → RUPEE string. Admins get the farmer +
 * bank join the farmer-facing getPayouts doesn't carry. */
export interface AdminPayout {
  id: string;
  amount: string | number;
  status: 'pending' | 'paid' | (string & {});
  method?: string | null;
  reference?: string | null;
  created_at?: string;
  paid_at?: string | null;
  farmer?: {
    id: string;
    fname?: string | null;
    lname?: string | null;
    phone?: string | null;
    bank_name?: string | null;
    bank_account?: string | null;
    ifsc?: string | null;
  } | null;
  order?: { id: string; code?: string | null } | null;
}

export interface AdminPayoutsResponse {
  payouts: AdminPayout[];
}

export interface RunSettlementResponse {
  message: string;
  created: number;
  payouts?: AdminPayout[];
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

export type EmployeeApprovalStatus = 'pending' | 'approved' | 'rejected' | (string & {});

export interface Employee {
  id?: string;
  /** Null until the request is approved — issued as MA…/CE… on approval. */
  emp_id?: string | null;
  fname?: string | null;
  lname?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
  designation?: string | null;
  department?: string | null;
  employment_type?: string | null;
  date_of_joining?: string | null;
  work_location?: string | null;
  work_district?: string | null;
  work_state?: string | null;
  district?: string | null;
  state?: string | null;
  reporting_manager?: string | null;
  reporting_manager_emp_id?: string | null;
  is_manager?: boolean;
  /** Trust flags — only Head Office / a Board of Director may set them. */
  is_board_director?: boolean;
  is_hr_admin?: boolean;
  status?: string | null;
  approval_status?: EmployeeApprovalStatus;
  approved_at?: string | null;
  rejected_reason?: string | null;
  created_at?: string | null;
  notes?: string | null;
  [key: string]: unknown;
}

export interface EmployeesResponse {
  employees: Employee[];
}

/** One row from the employee_audit_log (DB audit trigger).
 *
 * `changed_fields` was typed `string[]` here, which the trigger never writes —
 * it writes `{ field: { old, new } }` (021_employee_org.sql). The sheet guarded
 * on `.length`, an object has none, so every employee diff rendered blank. It
 * is an AuditEntry like the user log; both go through auditChanges(). */
export type EmployeeAuditEntry = AuditEntry;

export interface EmployeeAuditResponse {
  audit: EmployeeAuditEntry[];
}

/** One row from user_audit_log — same trigger shape as the employee log.
 *  Head Office / State Head only (backend isHeadOffice). */
export type UserAuditEntry = AuditEntry;

export interface UserAuditResponse {
  audit: UserAuditEntry[];
}

/** One login attempt — success AND failure. HO / State Head only. */
export interface LoginHistoryEntry {
  id: string | number;
  method?: string | null;
  success?: boolean | null;
  /** success | invalid_credentials | otp_invalid | blocked | pending_review | approved | rejected */
  outcome?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

export interface LoginHistoryResponse {
  logins: LoginHistoryEntry[];
}

/** Create/update body. The server whitelists fields (emp_id is never writable);
 *  the trust flags are honoured only for callers allowed to mint them. */
export interface EmployeePayload {
  fname?: string;
  lname?: string;
  gender?: string;
  dob?: string;
  phone?: string;
  email?: string;
  aadhar?: string;
  house_no?: string;
  street1?: string;
  street2?: string;
  state?: string;
  district?: string;
  taluk?: string;
  pincode?: string;
  city?: string;
  village_town?: string;
  designation?: string;
  department?: string;
  employment_type?: string;
  date_of_joining?: string;
  work_state?: string;
  work_district?: string;
  work_location?: string;
  is_manager?: boolean;
  reporting_manager?: string | null;
  reporting_manager_emp_id?: string | null;
  status?: string;
  notes?: string;
  is_board_director?: boolean;
  is_hr_admin?: boolean;
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
  /** The field → new-value map the seller asked for. A subscription renewal is
   *  encoded as { subscription_renewal: true, new_plan }, not a field map. */
  requested_changes: (Record<string, string> & { subscription_renewal?: boolean; new_plan?: string }) | null;
  requested_at?: string;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
  notes?: string | null;
  /* ── Admin-review fields (present on GET /users/change-requests) ── */
  user_id?: string;
  /** Requesting seller — denormalised onto the request row at submit time. */
  login_id?: string;
  fname?: string | null;
  /** Renewal only: the payment reference + amount (PAISE) once approved. */
  payment_reference?: string | null;
  renewal_amount?: number | null;
  payment_confirmed_at?: string | null;
  /** Joined from the seller's user row for context in the review sheet. */
  subscription_plan?: string | null;
  subscription_expires_at?: string | null;
}

/* ── Admin registrations (GET /registrations) ───────────────────────────────
 * A seller signup awaiting review. It's a users row, so it reuses the User
 * shape; `approval_status` drives the workflow (not `status`). */
export type RegistrationStatus =
  | 'pending_review' | 'approved' | 'payment_pending' | 'active' | 'rejected' | (string & {});

export type Registration = User;

/* ── Admin product catalog (GET/POST/PATCH/PUT/DELETE /products) ─────────────
 * Head Office only for writes. `market_price`/`handling` are backend money
 * fields → they arrive as RUPEE strings and must be sent back in rupees. */
export interface AdminDistrictPrice {
  district: string;
  market_price?: string | number;
  handling?: string | number;
}

/** The editable product fields (create + update). `code` is create-only. */
export interface ProductPayload {
  code?: string;
  name?: string;
  regional_name?: string | null;
  product_group?: string | null;
  category?: string | null;
  sub_type?: string | null;
  unit?: string;
  exotic?: boolean;
  platform_fee_pct?: number;
  available?: boolean;
}

/** One district-price row as the PUT endpoint wants it: rupees, converted to
 *  paise server-side. */
export interface ProductPriceInput {
  district: string;
  market_price_rs: number;
  handling_rs?: number;
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

/* ── Executive dashboard (GET /dashboard/executive) ─────────────────────────
 *
 * Board of Director / CEO / Managing Director / CFO / CTO, plus Head Office for
 * preview (backend EXECUTIVE_ROLES).
 *
 * MONEY: every amount here is ALREADY IN RUPEES. The route converts paise itself
 * (`rup()`) and deliberately names the fields OUTSIDE the money middleware's
 * MONEY_FIELDS set, so nothing double-converts them. Do NOT divide by 100 — that
 * is the opposite of the `daily_trend[].revenue` trap on GET /dashboard, which
 * IS paise. The two dashboards disagree; this one is already rupees.
 */
export interface ExecutiveSummary {
  revenue_today: number;
  revenue_mtd: number;
  revenue_ytd: number;
  gmv: number;
  total_orders: number;
  /** Percent change vs the previous period. May be negative. */
  order_growth_pct: number;
  customer_growth_pct: number;
  farmer_growth_pct: number;
  active_districts: number;
}

export interface ExecutiveDistrict {
  district: string;
  revenue: number;
  orders: number;
  /** Banded by revenue share against the peak district. */
  status: 'green' | 'amber' | 'red' | (string & {});
}

export interface ExecutiveCategory {
  name: string;
  revenue: number;
  orders: number;
}

export interface ExecutiveTopFarmer {
  farmer_id: string;
  name: string;
  revenue: number;
}

export interface ExecutiveTrendPoint {
  label: string;
  revenue: number;
  orders: number;
}

export interface ExecutiveAlert {
  type: string;
  severity: 'high' | 'medium' | 'low' | (string & {});
  message: string;
}

export type ExecutiveTrendMode = 'monthly' | 'quarterly' | 'yearly';

export interface ExecutiveDashboardResponse {
  scope: string;
  generated_at: string;
  summary: ExecutiveSummary;
  orders: { today: number; delivered: number; cancelled: number; pending: number; refunded: number };
  customers: { new: number; repeat: number; retention_pct: number; avg_basket: number };
  farmers: {
    registered: number;
    active: number;
    inactive: number;
    top: ExecutiveTopFarmer[];
    avg_rating: number | null;
  };
  categories: ExecutiveCategory[];
  logistics: { avg_delivery_mins: number | null; late_deliveries: number; sla_pct: number | null };
  financial: {
    platform_commission: number;
    delivery_income: number;
    subscription_income: number;
    payouts_pending: number;
    payouts_paid: number;
  };
  districts: ExecutiveDistrict[];
  trend: { mode: ExecutiveTrendMode; points: ExecutiveTrendPoint[] };
  alerts: ExecutiveAlert[];
  /** Metrics with no data source yet. The UI greys these out rather than
   *  inventing a number — see EXEC_PLACEHOLDERS in backend/routes/dashboard.js. */
  placeholders: string[];
}

/* ── GET /dashboard/operations ──────────────────────────────────────────────
 *
 * The operational managers' dashboard. MONEY: like /dashboard/executive, every
 * amount here is ALREADY IN RUPEES — the route converts paise itself and names
 * the fields outside the money middleware's MONEY_FIELDS set. Do not divide.
 *
 * SCOPE IS SERVER-SIDE. The route derives it from the signed-in user (District
 * Manager/Hub Incharge → their district; Regional/State/Zonal → their state;
 * Head Office → everything) and reports what it chose in `scope`. The client
 * sends no scope and cannot widen it.
 */
export type OperationsScopeLevel = 'district' | 'region' | 'all';

export interface OperationsScope {
  level: OperationsScopeLevel;
  /** The district name, the state name, or "All Regions". */
  name: string;
}

export interface OperationsAgent {
  name: string;
  phone: string | null;
  vehicle: string | null;
  district: string | null;
}

export interface OperationsDistrict {
  district: string;
  orders: number;
  revenue: number;
  pending: number;
}

export interface OperationsDashboardResponse {
  scope: OperationsScope;
  generated_at: string;
  summary: {
    orders_today: number;
    revenue_today: number;
    revenue_week: number;
    active_orders: number;
    delivered_today: number;
    pending_deliveries: number;
  };
  delivery_status: {
    /** Order status → count of active orders sitting at it. Keys are whatever
     *  statuses actually occur, so the UI must not assume a fixed set. */
    status_breakdown: Record<string, number>;
    agents_total: number;
  };
  collections: { confirmed_listings: number; listed_active: number; updated_today: number };
  quality: { pending_returns: number; rejected_returns: number; to_collect: number };
  payments: { pending_count: number; pending_amount: number; stale_count: number };
  farmers: { registered: number; active: number; pending_approval: number };
  /** Active delivery agents in scope — the route caps this at 20. */
  agents: OperationsAgent[];
  districts: OperationsDistrict[];
  alerts: ExecutiveAlert[];
  /** See OPS_PLACEHOLDERS in backend/routes/dashboard.js. */
  placeholders: string[];
}
