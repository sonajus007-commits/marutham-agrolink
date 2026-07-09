/* Typed API surface — endpoint names mirror frontend/js/api.js for an easy
 * mental map. Grows per-role as each role migrates. */
import { apiFetch } from './client';
import type {
  LoginResponse, MeResponse, ScanResponse, EligibleAgentsResponse,
  FieldDashboardResponse, MyEmployeeResponse, User,
  OrderingWindowResponse, TopRatingsResponse, LocationsResponse, PlaceOrderPayload,
  TrackResponse, ReturnRequestPayload, ReturnResponse, RateItemResponse,
  SubscriptionPlansResponse, SubscriptionPayResponse,
} from './types';
import type { Order, OrderDetail, Product, Offer, Payout } from '@marutham/lib';

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
  getFieldDashboard(): Promise<FieldDashboardResponse> {
    return apiFetch<FieldDashboardResponse>('GET', '/dashboard/field');
  },

  // ── Employees ──
  getMyEmployeeRecord(): Promise<MyEmployeeResponse> {
    return apiFetch<MyEmployeeResponse>('GET', '/employees/me');
  },
};

export type Api = typeof api;
