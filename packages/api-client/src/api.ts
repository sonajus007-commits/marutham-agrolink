/* Typed API surface — endpoint names mirror frontend/js/api.js for an easy
 * mental map. Grows per-role as each role migrates. */
import { apiFetch, apiFetchBlob } from './client';
import { apiFetchOffline } from './offlineSync';
import type {
  LoginResponse,
  MeResponse,
  ScanResponse,
  EligibleAgentsResponse,
  FieldDashboardResponse,
  MyEmployeeResponse,
  User,
  OrderingWindowResponse,
  TopRatingsResponse,
  MyRatingsResponse,
  LocationsResponse,
  PlaceOrderPayload,
  TrackResponse,
  ReturnRequestPayload,
  ReturnResponse,
  RateItemResponse,
  SubscriptionPlansResponse,
  SubscriptionPayResponse,
  ProfileChangeRequestResponse,
  MyChangeRequestsResponse,
  DashboardResponse,
  ExecutiveDashboardResponse,
  ExecutiveTrendMode,
  OperationsDashboardResponse,
  AdminHeadDashboardResponse,
  AccountStatus,
  UserStatusHistoryEntry,
  Registration,
  ProfileChangeRequest,
  ProductPayload,
  ProductPriceInput,
  AdminReturnsResponse,
  AdminReturn,
  AdminListing,
  AdminPayoutsResponse,
  RunSettlementResponse,
  EmployeesResponse,
  Employee,
  EmployeeAuditResponse,
  EmployeePayload,
  RemoveEmployeeResponse,
  RestoreEmployeeResponse,
  CreateStaffBody,
  CreateStaffResponse,
  OtpSendResponse,
  RegisterPayload,
  RegisterResponse,
  UserAuditResponse,
  LoginHistoryResponse,
  SpendByCategory,
  FrequentItem,
} from './types';
import type {
  Order,
  OrderDetail,
  Product,
  Offer,
  Payout,
  FarmerListing,
  ListingReviewStatus,
} from '@marutham/lib';
import { rupeesToPaise } from '@marutham/lib';

/**
 * A listing as the seller's form holds it: price in RUPEES, as typed.
 *
 * convertMoney() converts paise → rupees on responses and nothing converts back
 * on requests, so `farmer_price` read from a GET and posted straight back would
 * be 100x wrong. The conversion happens once, here, and nowhere else.
 */
export interface ListingPayload {
  product_id?: string;
  /** Rupees. Converted to paise before it leaves. */
  farmer_price?: number;
  qty_available?: number;
  time_available?: string;
  cutoff_ts?: string;
  bulk_qty?: number | null;
  bulk_disc_pct?: number | null;
  qty_type?: 'MOQ' | 'SPQ' | null;
  qty_value?: number | null;
  images?: string[];
  listed?: boolean;
  confirmed?: boolean;
}

function toListingBody(draft: Partial<ListingPayload>): Record<string, unknown> {
  const body: Record<string, unknown> = { ...draft };
  if (draft.farmer_price !== undefined) body.farmer_price = rupeesToPaise(draft.farmer_price);
  return body;
}

/* Every scan-to-advance action — VCO verify, hub dispatch, delivery — is the same
 * POST /orders/:id/scan; only the body differs. */
function scanBody(o: {
  route?: string;
  agentId?: string;
  coords?: { lat: number; lng: number };
  fromStage?: number;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (o.route) body.route = o.route;
  if (o.agentId) body.agent_id = o.agentId;
  if (o.coords) {
    body.lat = o.coords.lat;
    body.lng = o.coords.lng;
  }
  if (o.fromStage !== undefined) body.from_stage = o.fromStage;
  return body;
}

/**
 * A scan that survives a dead zone: sent now if there is signal, parked and replayed
 * on reconnect if there is not.
 *
 * `fromStage` is REQUIRED here, unlike on the online-only scanOrder. A scan advances
 * an order one step from wherever it currently is, so a write that sits in the queue
 * and replays after the order has moved would perform a DIFFERENT transition than the
 * one the user asked for. from_stage makes the server refuse that (409), and the
 * queue drops a 4xx rather than retrying it.
 *
 * Dedup is keep-first on (order, stage): a double-tap while offline collapses to one
 * write, while two genuinely different transitions queued offline — verify at stage 1,
 * then pick-up at stage 2 — keep separate entries and replay oldest-first, each one
 * asserting the stage the last left behind.
 */
function queuedScan(
  id: string,
  fromStage: number,
  rest: { route?: string; agentId?: string; coords?: { lat: number; lng: number } } = {},
): Promise<ScanResponse> {
  // The body is built HERE rather than by the caller, so a queued scan cannot be
  // keyed by a stage it forgot to actually assert — that would park an unguarded
  // write and put the stale-replay bug straight back.
  return apiFetchOffline<ScanResponse>(
    'POST',
    '/orders/' + id + '/scan',
    scanBody({ ...rest, fromStage }),
    { key: `scan-${id}-${fromStage}` },
  );
}

export const api = {
  // ── Auth ──
  login(phone: string, password: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('POST', '/auth/login', { phone, password }, false);
  },
  me(): Promise<MeResponse> {
    return apiFetch<MeResponse>('GET', '/auth/me');
  },
  /** Create an account. No session yet — consumers sign in after, sellers wait for approval. */
  register(payload: RegisterPayload): Promise<RegisterResponse> {
    return apiFetch<RegisterResponse>('POST', '/auth/register', payload, false);
  },
  /** Send a one-time code to a registered phone (for OTP login or reset). */
  sendOtp(phone: string): Promise<OtpSendResponse> {
    return apiFetch<OtpSendResponse>('POST', '/auth/send-otp', { phone }, false);
  },
  /** OTP login — returns a session just like password login. */
  verifyOtp(phone: string, otp: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('POST', '/auth/verify-otp', { phone, otp }, false);
  },
  /** Forgot-password: reset using a code from sendOtp. */
  resetPassword(phone: string, otp: string, new_password: string): Promise<{ message: string }> {
    return apiFetch('POST', '/auth/reset-password', { phone, otp, new_password }, false);
  },
  patchMe(data: Record<string, unknown>): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('PATCH', '/auth/me', data);
  },
  /** Provision the login account for an approved, active employee. Admin-only; the
   *  server derives the login role from the employee's designation and enforces which
   *  roles the caller may create. */
  createStaff(body: CreateStaffBody): Promise<CreateStaffResponse> {
    return apiFetch<CreateStaffResponse>('POST', '/auth/create-staff', body);
  },
  changePassword(current_password: string, new_password: string): Promise<{ message: string }> {
    return apiFetch('POST', '/auth/change-password', { current_password, new_password });
  },

  /* Sensitive seller fields (bank/GST/business) — submitted as a change request
   * for Head Office review, never written straight to the record. The server
   * 409s if a pending request already exists. See getMyChangeRequest for status. */
  profileChangeRequest(data: Record<string, string>): Promise<ProfileChangeRequestResponse> {
    return apiFetch<ProfileChangeRequestResponse>('POST', '/auth/profile-change-request', data);
  },
  getMyChangeRequest(): Promise<MyChangeRequestsResponse> {
    return apiFetch<MyChangeRequestsResponse>('GET', '/auth/my-change-request');
  },

  // ── Orders ──
  getOrders(params?: Record<string, string>): Promise<{ orders: Order[] }> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ orders: Order[] }>('GET', '/orders' + qs);
  },
  getOrder(id: string): Promise<OrderDetail> {
    return apiFetch<OrderDetail>('GET', '/orders/' + id);
  },
  /**
   * This month's item spend grouped by product category, for the buyer
   * dashboard's Total-Spent popup. `amount` is a rupee string (the API converts
   * from paise), ranked highest-first by the backend.
   */
  getSpendByCategory(): Promise<{ categories: SpendByCategory[] }> {
    return apiFetch<{ categories: SpendByCategory[] }>('GET', '/orders/spend-by-category');
  },
  /**
   * Products this buyer has ordered on 2+ separate orders — the "Buy Again"
   * candidates, ranked most-ordered first. Carries only the tally; the caller
   * filters to what's buyable in its district today and re-prices at today's rate.
   */
  getFrequentItems(): Promise<{ items: FrequentItem[] }> {
    return apiFetch<{ items: FrequentItem[] }>('GET', '/orders/frequent-items');
  },
  /** Live agent + ETA. Separate from getOrder so it can be polled cheaply. */
  trackOrder(id: string): Promise<TrackResponse> {
    return apiFetch<TrackResponse>('GET', '/orders/' + id + '/track');
  },
  /** The order's PDF invoice as a Blob (the caller triggers the browser download). */
  getInvoice(id: string): Promise<Blob> {
    return apiFetchBlob('/orders/' + id + '/invoice.pdf');
  },
  /** The order's full HTML invoice as a Blob (one A4 page per seller + a platform
   *  charges page). The caller opens it in a new tab where it can be printed/saved. */
  getInvoiceHtml(id: string): Promise<Blob> {
    return apiFetchBlob('/orders/' + id + '/invoice');
  },
  cancelOrder(id: string, reason?: string): Promise<{ message?: string }> {
    return apiFetch('POST', '/orders/' + id + '/cancel', { cancel_reason: reason || null });
  },
  requestReturn(orderId: string, data: ReturnRequestPayload): Promise<ReturnResponse> {
    return apiFetch<ReturnResponse>('POST', '/orders/' + orderId + '/return', data);
  },
  rateItem(orderId: string, itemId: string, rating_value: number): Promise<RateItemResponse> {
    return apiFetch<RateItemResponse>('POST', `/orders/${orderId}/items/${itemId}/rate`, {
      rating_value,
    });
  },
  /** Advance an order one step (scan-to-advance). Accepts an id or an order code.
   *  `coords` is optional proof-of-delivery location, stored only when this scan
   *  completes delivery (see backend/routes/delivery.js).
   *  `fromStage` is the stage the caller believes the order is at; the server refuses
   *  (409) if it has moved. Optional because a QR scan knows only the code — the
   *  scanner has not read the order and has no stage to assert. */
  scanOrder(
    idOrCode: string,
    routeHint?: string,
    coords?: { lat: number; lng: number },
    fromStage?: number,
  ): Promise<ScanResponse> {
    return apiFetch<ScanResponse>(
      'POST',
      '/orders/' + idOrCode + '/scan',
      scanBody({ route: routeHint, coords, fromStage }),
    );
  },
  /** VCO verify: sets route + assigns collection agent (same /scan endpoint).
   *  `coords` is the VCO's location at verification (stored as verified_lat/lng).
   *  Offline-capable — VCOs verify at collection points with no signal. */
  verifyOrderOffline(
    id: string,
    fromStage: number,
    data: { route?: string; agent_id?: string; coords?: { lat: number; lng: number } },
  ): Promise<ScanResponse> {
    const { coords, route, agent_id } = data || {};
    return queuedScan(id, fromStage, { route, agentId: agent_id, coords });
  },
  /* Name the last-mile Delivery Agent on an order sitting At Hub.
   * NOT a scan and NOT a status change — POST /assign only writes the agent
   * fields. The parcel moves when that agent scans it themselves (At Hub →
   * Picked Up), so the hub records the handover and the agent confirms it.
   * Online-only: a hub has signal, and there is no stage to assert. */
  assignAgent(id: string, agentId: string): Promise<{ message?: string }> {
    return apiFetch('POST', '/orders/' + id + '/assign', { agent_id: agentId });
  },
  /** Proof-of-delivery scan, offline-capable: the agent is at a doorstep, which is
   *  exactly where signal dies. `coords` is the delivery fix (geofenced server-side). */
  deliverOffline(
    id: string,
    fromStage: number,
    coords?: { lat: number; lng: number },
  ): Promise<ScanResponse> {
    return queuedScan(id, fromStage, { coords });
  },
  getEligibleAgents(id: string, leg?: string): Promise<EligibleAgentsResponse> {
    const qs = leg ? '?leg=' + encodeURIComponent(leg) : '';
    return apiFetch<EligibleAgentsResponse>('GET', '/orders/' + id + '/eligible-agents' + qs);
  },
  setRoute(id: string, route: string): Promise<{ message?: string }> {
    return apiFetch('PATCH', '/orders/' + id + '/route', { route });
  },
  /** Farmer marks their own order Packaged (Order Placed → Packaged). The server
   *  enforces farmer-role + stage 0 + "you have items in this order" (POST
   *  /orders/:id/pack). Online-only: unlike the field scans, packing happens at
   *  the farm where the seller has signal, and there is no stage to assert. */
  markPackaged(id: string): Promise<ScanResponse> {
    return apiFetch<ScanResponse>('POST', '/orders/' + id + '/pack');
  },
  /** Consumer confirms receipt of an Out-for-Delivery order → Delivered, which
   *  unlocks rating (POST /orders/:id/confirm-received). Consumer-only + owner-only
   *  + Out-for-Delivery-only server-side. */
  confirmReceived(id: string): Promise<ScanResponse> {
    return apiFetch<ScanResponse>('POST', '/orders/' + id + '/confirm-received');
  },
  /** Senior-admin manual override: set an order to ANY status on its route —
   *  forward, backward, or a jump (POST /orders/:id/status). Distinct from a scan
   *  or /advance, which only step one stage forward. The server gates the role and
   *  validates the status against the order's route. */
  setOrderStatus(id: string, status: string): Promise<ScanResponse> {
    return apiFetch<ScanResponse>('POST', '/orders/' + id + '/status', { status });
  },

  // ── Consumer storefront ──
  getProducts(params?: Record<string, string>): Promise<{ products: Product[] }> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ products: Product[] }>('GET', '/products' + qs);
  },
  getDistrictListings(district: string): Promise<{ by_product: Record<string, Offer[]> }> {
    return apiFetch('GET', '/listings?district=' + encodeURIComponent(district));
  },
  getListings(params?: Record<string, string>): Promise<{ listings: Offer[] }> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ listings: Offer[] }>('GET', '/listings' + qs);
  },
  getOrderingWindow(): Promise<OrderingWindowResponse> {
    return apiFetch<OrderingWindowResponse>('GET', '/config/ordering-window', undefined, false);
  },
  getTopRatings(): Promise<TopRatingsResponse> {
    return apiFetch<TopRatingsResponse>('GET', '/ratings/top');
  },
  /** The signed-in seller's own customer-ratings summary. */
  getMyRatings(): Promise<MyRatingsResponse> {
    return apiFetch<MyRatingsResponse>('GET', '/ratings/mine');
  },
  getLocations(): Promise<LocationsResponse> {
    return apiFetch<LocationsResponse>('GET', '/locations', undefined, false);
  },
  placeOrder(payload: PlaceOrderPayload): Promise<{ order: Order }> {
    return apiFetch<{ order: Order }>('POST', '/orders', payload);
  },

  // ── Seller: listings ──
  /** A farmer's own listings, with the product joined. */
  getMyListings(): Promise<{ listings: FarmerListing[] }> {
    return apiFetch<{ listings: FarmerListing[] }>('GET', '/listings');
  },
  createListing(draft: ListingPayload): Promise<{ listing: FarmerListing }> {
    return apiFetch('POST', '/listings', toListingBody(draft));
  },
  updateListing(id: string, draft: Partial<ListingPayload>): Promise<{ listing: FarmerListing }> {
    return apiFetch('PATCH', '/listings/' + id, toListingBody(draft));
  },
  /** Flip confirmed/listed without touching price or stock. */
  setListingFlags(
    id: string,
    flags: { confirmed?: boolean; listed?: boolean },
  ): Promise<{ listing: FarmerListing }> {
    return apiFetch('PATCH', '/listings/' + id, flags);
  },
  deleteListing(id: string): Promise<{ message: string }> {
    return apiFetch('DELETE', '/listings/' + id);
  },

  // ── Admin: listing approvals ──
  /** Seller product requests in ONE state. The endpoint has no "all" mode — it is
   *  a hard `.eq('listing_status', …)` — so a caller wanting every listing must
   *  ask for each status and merge (see ListingsPage), exactly as the change-
   *  requests screen does. */
  getAdminListings(status: ListingReviewStatus): Promise<{ listings: AdminListing[] }> {
    return apiFetch<{ listings: AdminListing[] }>(
      'GET',
      '/listings/admin/pending?status=' + encodeURIComponent(status),
    );
  },
  /** Approve (`active`), refuse (`rejected`), or pull back for review (`pending`).
   *
   *  NOT a silent write: the seller is emailed and texted either way
   *  (notifyProductApproved / notifyProductRejected). Do not call speculatively.
   *
   *  `reason` is REQUIRED when rejecting and the server 400s without it — the seller
   *  is shown it, and a refusal with no reason gives them nothing to fix. It is
   *  ignored for the other statuses, which CLEAR any stored reason. */
  setListingStatus(
    id: string,
    status: ListingReviewStatus,
    reason?: string,
  ): Promise<{ message: string; listing: AdminListing }> {
    return apiFetch('PATCH', '/listings/' + id + '/status', {
      status,
      ...(status === 'rejected' ? { rejection_reason: reason ?? '' } : {}),
    });
  },

  // ── Seller: earnings + subscription ──
  /** Farmers see only their own payouts (scoped server-side). */
  getPayouts(): Promise<{ payouts: Payout[] }> {
    return apiFetch<{ payouts: Payout[] }>('GET', '/payouts');
  },
  getSubscriptionPlans(): Promise<SubscriptionPlansResponse> {
    return apiFetch<SubscriptionPlansResponse>('GET', '/subscription/plans');
  },
  /** Only the plan name is sent — the server prices it, and never trusts a client amount. */
  paySubscription(plan: string): Promise<SubscriptionPayResponse> {
    return apiFetch<SubscriptionPayResponse>('POST', '/subscription/pay', { plan });
  },

  // ── Dashboards ──
  /** The admin Overview — role-scoped server-side from the caller's admin_role.
   *  Broad (unscoped) roles may drill down by state/district; the server ignores
   *  these params for a geo-locked role. */
  getDashboard(params?: { state?: string; district?: string }): Promise<DashboardResponse> {
    const qs = new URLSearchParams();
    if (params?.state) qs.set('state', params.state);
    if (params?.district) qs.set('district', params.district);
    const q = qs.toString();
    return apiFetch<DashboardResponse>('GET', `/dashboard${q ? `?${q}` : ''}`);
  },
  getFieldDashboard(): Promise<FieldDashboardResponse> {
    return apiFetch<FieldDashboardResponse>('GET', '/dashboard/field');
  },
  /** Company-wide business overview. 403s for anyone outside EXECUTIVE_ROLES.
   *  Every money value comes back in RUPEES already — see ExecutiveDashboardResponse. */
  getExecutiveDashboard(
    trend: ExecutiveTrendMode = 'monthly',
    params?: { state?: string; district?: string },
  ): Promise<ExecutiveDashboardResponse> {
    const qs = new URLSearchParams({ trend });
    if (params?.state) qs.set('state', params.state);
    if (params?.district) qs.set('district', params.district);
    return apiFetch<ExecutiveDashboardResponse>('GET', `/dashboard/executive?${qs.toString()}`);
  },
  /** District/region-scoped operations dashboard. 403s outside the OPS_* roles.
   *  The SERVER picks the scope from the caller — there is no scope parameter to
   *  pass, and none to tamper with. Money comes back in RUPEES already. */
  getOperationsDashboard(): Promise<OperationsDashboardResponse> {
    return apiFetch<OperationsDashboardResponse>('GET', '/dashboard/operations');
  },
  /** The Head Office control panel — employees, approvals, staff, audit activity.
   *  403s outside ADMINHEAD_ROLES (Head Office / Technical Admin / HR Admin / HR
   *  Manager). Company-wide, so there is no scope to pass. Returns no money. */
  getAdminHeadDashboard(): Promise<AdminHeadDashboardResponse> {
    return apiFetch<AdminHeadDashboardResponse>('GET', '/dashboard/adminhead');
  },

  // ── Admin: users ──
  /** Role-scoped by the server. Filters: role, admin_role, district. */
  getUsers(params?: Record<string, string>): Promise<{ users: User[] }> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<{ users: User[] }>('GET', '/users' + qs);
  },
  getUser(id: string): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('GET', '/users/' + id);
  },
  /** active | suspended | blocked. A block needs a reason (server enforces). */
  setUserStatus(
    id: string,
    status: AccountStatus,
    reason?: string,
  ): Promise<{ message: string; user: User }> {
    return apiFetch('PATCH', '/users/' + id + '/status', { status, reason: reason || null });
  },
  getUserStatusHistory(id: string): Promise<{ history: UserStatusHistoryEntry[] }> {
    return apiFetch<{ history: UserStatusHistoryEntry[] }>(
      'GET',
      '/users/' + id + '/status-history',
    );
  },
  /* Record-change trail from the DB audit trigger, and every login attempt.
   * Both are Head Office / State Head only — a scoped admin gets a 403, so
   * callers must gate the UI (canSeeAudit) rather than let the sheet fault. */
  getUserAuditLog(id: string): Promise<UserAuditResponse> {
    return apiFetch<UserAuditResponse>('GET', '/users/' + id + '/audit-log');
  },
  getUserLoginHistory(id: string): Promise<LoginHistoryResponse> {
    return apiFetch<LoginHistoryResponse>('GET', '/users/' + id + '/login-history');
  },

  // ── Admin: registrations (seller signups awaiting review) ──
  /** Role-scoped server-side. status: pending_review|payment_pending|active|rejected|all. */
  getRegistrations(status?: string): Promise<{ registrations: Registration[] }> {
    const qs = status ? '?status=' + encodeURIComponent(status) : '';
    return apiFetch<{ registrations: Registration[] }>('GET', '/registrations' + qs);
  },
  getRegistration(id: string): Promise<{ registration: Registration }> {
    return apiFetch<{ registration: Registration }>('GET', '/registrations/' + id);
  },
  /** Activates the seller's login → 'suspended' (payment screen only). No amount here. */
  approveRegistration(id: string): Promise<{ message: string; registration: Registration }> {
    return apiFetch('POST', '/registrations/' + id + '/approve', {});
  },
  rejectRegistration(id: string, reason: string): Promise<{ message: string }> {
    return apiFetch('POST', '/registrations/' + id + '/reject', { reason });
  },
  /** Manual (offline-paid) activation: only valid while approval_status = payment_pending. */
  confirmRegistrationPayment(id: string): Promise<{ message: string; registration: Registration }> {
    return apiFetch('POST', '/registrations/' + id + '/confirm-payment', {});
  },

  // ── Admin: profile change requests (Head Office only) ──
  /** status: pending|approved|rejected|payment_pending. Default pending. */
  getChangeRequests(status?: string): Promise<{ requests: ProfileChangeRequest[] }> {
    const qs = status ? '?status=' + encodeURIComponent(status) : '';
    return apiFetch<{ requests: ProfileChangeRequest[] }>('GET', '/users/change-requests' + qs);
  },
  /** A renewal needs renewal_amount (RUPEES) → sends the seller a payment request.
   *  A regular change applies the fields straight away. */
  approveChangeRequest(
    id: string,
    opts?: { notes?: string; renewal_amount?: number },
  ): Promise<{ message: string; payment_reference?: string }> {
    return apiFetch('POST', '/users/change-requests/' + id + '/approve', {
      notes: opts?.notes || null,
      ...(opts?.renewal_amount != null ? { renewal_amount: opts.renewal_amount } : {}),
    });
  },
  rejectChangeRequest(id: string, notes?: string): Promise<{ message: string }> {
    return apiFetch('POST', '/users/change-requests/' + id + '/reject', { notes: notes || null });
  },
  /** Renewal step 2: mark the payment received → extends the subscription. */
  confirmRenewalPayment(id: string): Promise<{ message: string }> {
    return apiFetch('POST', '/users/change-requests/' + id + '/confirm-renewal-payment', {});
  },

  // ── Admin: product catalog (writes are Head Office only, enforced server-side) ──
  /** Full catalogue detail: the product + every farmer listing for it. */
  getProduct(id: string): Promise<{ product: Product; listings: unknown[] }> {
    return apiFetch<{ product: Product; listings: unknown[] }>('GET', '/products/' + id);
  },
  createProduct(body: ProductPayload): Promise<{ message: string; product: Product }> {
    return apiFetch('POST', '/products', body);
  },
  updateProduct(id: string, body: ProductPayload): Promise<{ message: string; product: Product }> {
    return apiFetch('PATCH', '/products/' + id, body);
  },
  /** Upserts per-district govt/market prices. Amounts are RUPEES here. */
  saveProductPrices(id: string, prices: ProductPriceInput[]): Promise<{ message: string }> {
    return apiFetch('PUT', '/products/' + id + '/prices', { prices });
  },
  /** Removes one district's price — the only way to take a district off a product
   *  (saveProductPrices upserts and never deletes). */
  deleteProductPrice(id: string, district: string): Promise<{ message: string }> {
    return apiFetch('DELETE', '/products/' + id + '/prices/' + encodeURIComponent(district));
  },
  deleteProduct(id: string): Promise<{ message: string }> {
    return apiFetch('DELETE', '/products/' + id);
  },

  // ── Admin: returns queue (role-scoped server-side) ──
  getReturns(): Promise<AdminReturnsResponse> {
    return apiFetch<AdminReturnsResponse>('GET', '/returns');
  },
  /** Accept or reject a pending return. A rejected return is closed; an accepted
   *  one still needs collectReturn to trigger the refund. */
  decideReturn(
    id: string,
    decision: 'accepted' | 'rejected',
  ): Promise<{ message: string; return: AdminReturn }> {
    return apiFetch('PATCH', '/returns/' + id + '/decide', { decision });
  },
  /** Mark accepted goods collected → triggers the refund. */
  collectReturn(id: string): Promise<{
    message: string;
    return: AdminReturn;
    refund: { amount_paise: number; to: string };
  }> {
    return apiFetch('PATCH', '/returns/' + id + '/collect', {});
  },

  // ── Admin: payouts (role-scoped list; settlement is a global batch) ──
  /** Admin view: carries the farmer + bank join (unlike the farmer getPayouts). */
  getAdminPayouts(): Promise<AdminPayoutsResponse> {
    return apiFetch<AdminPayoutsResponse>('GET', '/payouts');
  },
  /** Creates pending payout records for every delivered, unsettled order. Global,
   *  not district-scoped — the UI restricts the trigger to Head Office. */
  runSettlement(): Promise<RunSettlementResponse> {
    return apiFetch<RunSettlementResponse>('POST', '/payouts/run', {});
  },

  // ── Employees ──
  getMyEmployeeRecord(): Promise<MyEmployeeResponse> {
    return apiFetch<MyEmployeeResponse>('GET', '/employees/me');
  },

  // ── Admin: employee tracker (Head Office / State Head / HR Admin / BoD) ──
  /** Optional filters: status, approval_status, q (search).
   *  Removed employees are excluded — use getRemovedEmployees() for those. */
  getEmployees(params?: Record<string, string>): Promise<EmployeesResponse> {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiFetch<EmployeesResponse>('GET', '/employees' + qs);
  },
  /** ONLY the removed employees. A separate call, not a filter on the list above,
   *  because the server treats them as a different set — they are absent from every
   *  ordinary employee query by design. */
  getRemovedEmployees(): Promise<EmployeesResponse> {
    return apiFetch<EmployeesResponse>('GET', '/employees?deleted=1');
  },
  getEmployee(id: string): Promise<{ employee: Employee }> {
    return apiFetch<{ employee: Employee }>('GET', '/employees/' + id);
  },
  /** Look an employee up by Employee ID. `existing_login_id` is the staff login bound
   *  to that ID, or null if they never got one — an Employee ID does NOT imply a login.
   *  404s for a removed employee. */
  lookupEmployee(empId: string): Promise<{ employee: Employee; existing_login_id: string | null }> {
    return apiFetch('GET', '/employees/lookup/' + encodeURIComponent(empId));
  },
  getEmployeeHistory(id: string): Promise<EmployeeAuditResponse> {
    return apiFetch<EmployeeAuditResponse>('GET', '/employees/' + id + '/history');
  },
  /** Approve a pending employee → issues the Employee ID and marks them active. */
  approveEmployee(id: string): Promise<{ message: string; employee: Employee }> {
    return apiFetch('PATCH', '/employees/' + id + '/approve', {});
  },
  rejectEmployee(id: string, reason?: string): Promise<{ message: string; employee: Employee }> {
    return apiFetch('PATCH', '/employees/' + id + '/reject', { reason: reason || null });
  },
  /** Managers for the reporting-manager picker — scoped to a Work District +
   *  Department (both required); pass the employee's own id to exclude self. */
  getManagers(params: {
    district: string;
    department: string;
    exclude?: string;
  }): Promise<{ managers: Employee[] }> {
    const qs = new URLSearchParams({
      district: params.district,
      department: params.department,
      ...(params.exclude ? { exclude: params.exclude } : {}),
    }).toString();
    return apiFetch<{ managers: Employee[] }>('GET', '/employees/managers?' + qs);
  },
  /** BoD/HR-flagged records auto-approve and get an Employee ID immediately;
   *  everyone else is created pending. */
  createEmployee(body: EmployeePayload): Promise<{ message: string; employee: Employee }> {
    return apiFetch('POST', '/employees', body);
  },
  /** emp_id is never editable; trust flags honoured only for minters. */
  updateEmployee(
    id: string,
    body: EmployeePayload,
  ): Promise<{ message: string; employee: Employee }> {
    return apiFetch('PATCH', '/employees/' + id, body);
  },
  /** Remove an employee — a SOFT delete. The record and its audit history survive
   *  (they are what the removal exists to preserve), and the login joined to their
   *  Employee ID is revoked: requireAuth re-reads the user row on every request, so
   *  they are signed out on their very next call rather than when their token expires.
   *  Reversible with restoreEmployee(). */
  removeEmployee(id: string): Promise<RemoveEmployeeResponse> {
    return apiFetch<RemoveEmployeeResponse>('DELETE', '/employees/' + id);
  },
  /** Undo a removal — for the re-hire, and for the misclick. Brings back the record
   *  and re-enables the login. */
  restoreEmployee(id: string): Promise<RestoreEmployeeResponse> {
    return apiFetch<RestoreEmployeeResponse>('POST', '/employees/' + id + '/restore', {});
  },

  /** Register the native app's push token (FCM/APNs) against the signed-in user, so
   *  the backend can target a notification at this device. Called after sign-in from
   *  the Capacitor shell; a no-op in the browser (see apps/web/src/native/push.ts). */
  registerPushToken(
    token: string,
    platform: 'android' | 'ios' | 'web',
  ): Promise<{ message: string }> {
    return apiFetch('POST', '/notifications/device', { token, platform });
  },

  /** Drop this device's push token on sign-out, so a signed-out phone stops receiving
   *  the previous user's notifications. */
  unregisterPushToken(token: string): Promise<{ message: string }> {
    return apiFetch('DELETE', '/notifications/device', { token });
  },
};

export type Api = typeof api;
