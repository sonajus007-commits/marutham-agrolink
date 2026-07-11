/* Typed API surface — endpoint names mirror frontend/js/api.js for an easy
 * mental map. Grows per-role as each role migrates. */
import { apiFetch } from './client';
import type {
  LoginResponse, MeResponse, ScanResponse, EligibleAgentsResponse,
  FieldDashboardResponse, MyEmployeeResponse, User,
  OrderingWindowResponse, TopRatingsResponse, LocationsResponse, PlaceOrderPayload,
  TrackResponse, ReturnRequestPayload, ReturnResponse, RateItemResponse,
  SubscriptionPlansResponse, SubscriptionPayResponse,
  ProfileChangeRequestResponse, MyChangeRequestsResponse,
  DashboardResponse, AccountStatus, UserStatusHistoryEntry,
  Registration, ProfileChangeRequest, ProductPayload, ProductPriceInput,
} from './types';
import type { Order, OrderDetail, Product, Offer, Payout, FarmerListing } from '@marutham/lib';
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

export const api = {
  // ── Auth ──
  login(phone: string, password: string): Promise<LoginResponse> {
    return apiFetch<LoginResponse>('POST', '/auth/login', { phone, password }, false);
  },
  me(): Promise<MeResponse> {
    return apiFetch<MeResponse>('GET', '/auth/me');
  },
  patchMe(data: Record<string, unknown>): Promise<{ user: User }> {
    return apiFetch<{ user: User }>('PATCH', '/auth/me', data);
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
  /** Live agent + ETA. Separate from getOrder so it can be polled cheaply. */
  trackOrder(id: string): Promise<TrackResponse> {
    return apiFetch<TrackResponse>('GET', '/orders/' + id + '/track');
  },
  cancelOrder(id: string, reason?: string): Promise<{ message?: string }> {
    return apiFetch('POST', '/orders/' + id + '/cancel', { cancel_reason: reason || null });
  },
  requestReturn(orderId: string, data: ReturnRequestPayload): Promise<ReturnResponse> {
    return apiFetch<ReturnResponse>('POST', '/orders/' + orderId + '/return', data);
  },
  rateItem(orderId: string, itemId: string, rating_value: number): Promise<RateItemResponse> {
    return apiFetch<RateItemResponse>('POST', `/orders/${orderId}/items/${itemId}/rate`, { rating_value });
  },
  /** Advance an order one step (scan-to-advance). Accepts an id or an order code. */
  scanOrder(idOrCode: string, routeHint?: string): Promise<ScanResponse> {
    return apiFetch<ScanResponse>('POST', '/orders/' + idOrCode + '/scan', routeHint ? { route: routeHint } : {});
  },
  /** VCO verify: sets route + assigns collection agent (same /scan endpoint). */
  verifyOrder(id: string, data: { route?: string; agent_id?: string }): Promise<ScanResponse> {
    return apiFetch<ScanResponse>('POST', '/orders/' + id + '/scan', data || {});
  },
  getEligibleAgents(id: string, leg?: string): Promise<EligibleAgentsResponse> {
    const qs = leg ? '?leg=' + encodeURIComponent(leg) : '';
    return apiFetch<EligibleAgentsResponse>('GET', '/orders/' + id + '/eligible-agents' + qs);
  },
  setRoute(id: string, route: string): Promise<{ message?: string }> {
    return apiFetch('PATCH', '/orders/' + id + '/route', { route });
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
  setListingFlags(id: string, flags: { confirmed?: boolean; listed?: boolean }): Promise<{ listing: FarmerListing }> {
    return apiFetch('PATCH', '/listings/' + id, flags);
  },
  deleteListing(id: string): Promise<{ message: string }> {
    return apiFetch('DELETE', '/listings/' + id);
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
  /** The admin Overview — role-scoped server-side from the caller's admin_role. */
  getDashboard(): Promise<DashboardResponse> {
    return apiFetch<DashboardResponse>('GET', '/dashboard');
  },
  getFieldDashboard(): Promise<FieldDashboardResponse> {
    return apiFetch<FieldDashboardResponse>('GET', '/dashboard/field');
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
  setUserStatus(id: string, status: AccountStatus, reason?: string): Promise<{ message: string; user: User }> {
    return apiFetch('PATCH', '/users/' + id + '/status', { status, reason: reason || null });
  },
  getUserStatusHistory(id: string): Promise<{ history: UserStatusHistoryEntry[] }> {
    return apiFetch<{ history: UserStatusHistoryEntry[] }>('GET', '/users/' + id + '/status-history');
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
  approveChangeRequest(id: string, opts?: { notes?: string; renewal_amount?: number }): Promise<{ message: string; payment_reference?: string }> {
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

  // ── Employees ──
  getMyEmployeeRecord(): Promise<MyEmployeeResponse> {
    return apiFetch<MyEmployeeResponse>('GET', '/employees/me');
  },
};

export type Api = typeof api;
