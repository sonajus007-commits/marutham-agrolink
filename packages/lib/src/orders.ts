/* Order domain types + queue grouping — the logic that agent.html did inline
 * in loadOrders(). Pure, so the Agent web screen and a future RN screen group
 * identically. */
import { fmtMoney } from './format';
import type { AddressObject } from './format';

export interface OrderItem {
  /** order_items row id — the handle the rating endpoint takes. */
  id?: string;
  /**
   * The order row this line belongs to. On a multi-vendor order that is the
   * seller's CHILD order, not the parent the customer sees — which is the id the
   * rating endpoint must be called with, since it checks the line against the order
   * it was asked about.
   */
  order_id?: string;
  product_id?: string;
  product_code?: string;
  name: string;
  qty: number;
  unit?: string;
  /** Postgres numeric arrives as a string; always coerce before arithmetic. */
  price?: number | string;
  farmer_id?: string;
  farmer_name?: string;
  rated?: boolean;
  rating_value?: number;
  /** VCO verification (migration 059) — the quantity actually received and its
   *  quality grade, captured at collection. Null until a VCO records them. */
  verified_qty?: number | string | null;
  quality?: ItemQuality | null;
  verify_note?: string | null;
}

/** Quality grades a VCO assigns to a received line at verification. */
export type ItemQuality = 'good' | 'fair' | 'poor' | 'rejected';

export interface OrderHistoryEntry {
  label: string;
  ts?: string;
  note?: string;
}

export interface Order {
  id: string;
  status: string;
  /**
   * Index into the route's status list (backend STAGE_MAP) — `status` is derived
   * from it. Returned by both GET /orders/:id and the list endpoint. Send it back as
   * `from_stage` on a scan so the server can refuse the write if the order moved on:
   * a scan advances from wherever the order IS, so a delayed one is a different act.
   */
  stage?: number;
  cancelled?: boolean;
  code?: string;
  /**
   * When the seller must have ACCEPTED by (cutoff + 2h), set at placement. Past it,
   * an un-accepted order is auto-cancelled + refunded (migration 063). Null on rows
   * with no deadline (e.g. a split parent container).
   */
  accept_deadline?: string | null;
  /** Seller accepted but declined some lines (migration 065). Status stays
   *  'Order Accepted'; display it with displayStatus() → 'Partially Accepted'. */
  partially_accepted?: boolean;
  /** The VCO's advisory packing rating at verify (migration 066); null = not rated. */
  packing_quality?: 'good' | 'fair' | 'poor' | null;
  /** Why the order was cancelled — server-authored (decline, missed window, admin). */
  cancel_reason?: string | null;
  consumer_name?: string;
  consumer_phone?: string;
  delivery_address?: string | AddressObject | null;
  pay_method?: string;
  pay_status?: string;
  total?: string | number;
  item_total?: string | number;
  handling?: string | number;
  delivery?: string | number;
  route?: string | null;
  eta_ts?: string | null;
  agent_name?: string;
  agent_vehicle?: string;
  village?: string;
  /** Delivery district — returned by the admin orders list; used to geo-filter. */
  district?: string | null;
  created_at?: string;
  delivered_at?: string | null;
  /**
   * Geolocation stamps for the live-tracking map, all best-effort and nullable
   * (a device fix can be declined at any handoff). `dest_*` is where the parcel is
   * headed — the pin the consumer dropped on the delivery address; `dispatched_*` is
   * where the hub sent it for last-mile; `delivered_*` is where it actually arrived.
   * Returned by GET /orders/:id and GET /delivery/:id/track (both select '*').
   */
  dest_lat?: number | null;
  dest_lng?: number | null;
  dispatched_lat?: number | null;
  dispatched_lng?: number | null;
  delivered_lat?: number | null;
  delivered_lng?: number | null;
  /** Count of failed delivery attempts (migration 058). >0 flags a re-attempt in
   *  the agent's queue and the delivery sheet. */
  delivery_attempts?: number | null;
  /**
   * Existing return for this order, or null. Not a column — GET /orders/:id
   * derives it from the returns table, so it is absent on the list endpoint.
   */
  return_id?: string | null;
  return_code?: string | null;
  return_status?: string | null;
  saved?: string | number;
  /**
   * How many lines the order has. Not a column — GET /orders counts order_items
   * for CONSUMERS only, so it is absent for every other role. A farmer's list is
   * filtered to orders containing her produce but an order may hold other
   * farmers' lines too, and a whole-order tally on her screen would be a number
   * about somebody else.
   */
  item_count?: number;
  [key: string]: unknown;
}

/**
 * One seller's parcel within a multi-vendor order.
 *
 * A cart spanning sellers is stored as a parent order (what the customer paid for)
 * plus one CHILD order per seller, because each seller's goods sit in their own
 * village, are verified by that village's VCO, and take their own route to the door.
 * The customer still sees a single order; this is what it is made of.
 */
export interface OrderPart extends Order {
  /** 1-based position in the parent, and the suffix on this parcel's code. */
  split_seq: number;
  seller_id: string;
  seller_name?: string;
  /** This parcel's own lines. The parent's `items` is all of them together. */
  items?: OrderItem[];
  /** Lines this parcel's seller declined (partial accept). */
  declined_items?: DeclinedOrderItem[];
}

/** A line the seller declined while accepting the rest (migration 065). It is no
 *  longer part of the order's money — shown struck through as "not supplied". */
export interface DeclinedOrderItem {
  id: string;
  order_id: string;
  product_id?: string;
  name: string;
  farmer_id?: string;
  farmer_name?: string;
  qty: number | string;
  unit?: string;
  price?: number | string;
  reason?: string | null;
  declined_at?: string;
}

export interface OrderDetail {
  order: Order;
  items: OrderItem[];
  /** Lines the seller declined (partial accept). Absent on older servers. */
  declined_items?: DeclinedOrderItem[];
  history: OrderHistoryEntry[];
  qr_svg?: string;
  /**
   * The delivery confirmation code (soft OTP), returned ONLY to the customer who
   * owns the order — the server strips it from every other payload. The customer
   * reads it to the delivery agent at the door. Absent for non-owners and for
   * orders placed before the feature existed.
   */
  otp?: string | null;
  /**
   * Present ONLY on a multi-vendor order, so an order placed with one seller has
   * exactly the shape it always had. Each part tracks separately and may arrive on
   * its own day.
   */
  parts?: OrderPart[];
}

export interface OrderQueues {
  toVerify: Order[]; // Packaged — VCO to verify
  toPickUp: Order[]; // VCO Verified — agent to pick up
  toCollect: Order[]; // At Hub — last-mile agent to collect FROM the hub
  inTransit: Order[]; // Picked Up — agent to advance to Out for Delivery
  toDeliver: Order[]; // Out for Delivery — agent to deliver
  inProgress: Order[]; // Order Placed / In Transit — view only
  delivered: Order[]; // Delivered
}

/* 'At Hub' is NOT here: on the hub lane the Hub Incharge assigns a last-mile agent
 * and that agent then scans their own pickup, so it is an ACTIONABLE queue for them
 * (toCollect), not a view-only status. Leaving it in this list was why an assigned
 * agent could see the order but had no button to collect it. 'In Transit' stays —
 * that leg is a bulk movement received by hub staff, not by an agent. */
const IN_PROGRESS_STATUSES = ['Order Placed', 'In Transit'];

/** Group a flat order list into the Agent screen's queues. */
export function groupOrders(orders: Order[]): OrderQueues {
  const active = (s: string) => (o: Order) => o.status === s && !o.cancelled;
  return {
    toVerify: orders.filter(active('Packed')),
    toPickUp: orders.filter(active('VCO Verified')),
    toCollect: orders.filter(active('At Hub')),
    inTransit: orders.filter(active('Picked Up')),
    toDeliver: orders.filter(active('Out for Delivery')),
    inProgress: orders.filter((o) => IN_PROGRESS_STATUSES.includes(o.status) && !o.cancelled),
    delivered: orders.filter((o) => o.status === 'Delivered'),
  };
}

export interface AgentStats {
  queue: number;
  completed: number;
  /** COD collected (Delivery Agent, rupees) or pipeline count (VCO). */
  codOrPipeline: string;
}

/** Derive the 3 header stats, role-aware (VCO vs Delivery Agent). A VCO flagged
 *  `canDeliver` also works last-mile, so their queue count folds in the
 *  collect-from-hub lane on top of their verify lane. */
export function deriveAgentStats(q: OrderQueues, isVCO: boolean, canDeliver = false): AgentStats {
  const queue =
    (isVCO ? q.toVerify.length : 0) +
    (!isVCO || canDeliver ? q.toCollect.length : 0) +
    q.toPickUp.length +
    q.inTransit.length +
    q.toDeliver.length;
  if (isVCO) {
    const pipeline = q.toPickUp.length + q.inTransit.length + q.toDeliver.length;
    return {
      queue,
      completed: pipeline,
      codOrPipeline: String(pipeline + q.delivered.length),
    };
  }
  const cod = q.delivered.reduce(
    (s, o) => s + (o.pay_method === 'Cash on Delivery' ? parseFloat(String(o.total || 0)) : 0),
    0,
  );
  return { queue, completed: q.delivered.length, codOrPipeline: fmtMoney(cod) };
}

/* ── Order policy ──────────────────────────────────────────────────────────
 * These mirror server-side rules. The server remains the authority (it
 * re-checks and returns 400); we duplicate them only to decide whether to
 * *offer* the action, so users never click a button that is going to fail.
 * Keep in step with backend/routes/orders.js CANCELLABLE_STAGES and
 * backend/routes/returns.js RETURN_WINDOW_HOURS. */

/** Statuses at which a consumer may still cancel (backend stages 0–3: before the
 *  VCO verifies and it is on the road). */
export const CANCELLABLE_STATUSES: readonly string[] = [
  'Order Placed',
  'Order Received',
  'Order Accepted',
  'Packed',
];

/** Statuses where the order is waiting on the SELLER to act — accept it, then pack
 *  it — before it is handed to the VCO. Drives the farmer's "to do" counts. */
export const SELLER_ACTION_STATUSES: readonly string[] = ['Order Received', 'Order Accepted'];

/** Hours after delivery during which a return may be requested. */
export const RETURN_WINDOW_HOURS = 24;

const MS_PER_HOUR = 36e5;

/**
 * Cancellation is signalled two different ways depending on the endpoint:
 * `GET /orders/:id` returns the whole row (so `cancelled` is set), but the list
 * `GET /orders` selects a narrow column set that omits it. Both, however, carry
 * `status`, which the cancel handler writes as 'Cancelled'. Check both, or a
 * cancelled order shows up as "active" in any list-fed view.
 */
export function isOrderCancelled(o: Order): boolean {
  return !!o.cancelled || o.status === 'Cancelled';
}

/**
 * The status to SHOW for an order: 'Cancelled' for a cancelled row, 'Partially
 * Accepted' for an accepted parcel the seller declined some lines of, else the raw
 * status. Display only — the pipeline, rollups and every rule key off the raw
 * status (`o.status`), where 'Partially Accepted' is not a value and never will be.
 * `raw` lets a caller pass an optimistic status it has just set locally.
 */
export function displayStatus(o: Order, raw: string = String(o.status ?? '')): string {
  if (isOrderCancelled(o)) return 'Cancelled';
  if (raw === 'Order Accepted' && o.partially_accepted) return 'Partially Accepted';
  return raw;
}

/** In flight — neither delivered nor cancelled. */
export function isOrderActive(o: Order): boolean {
  return !isOrderCancelled(o) && o.status !== 'Delivered';
}

export function canCancelOrder(o: Order): boolean {
  return !isOrderCancelled(o) && CANCELLABLE_STATUSES.includes(o.status);
}

/** Hours left in the return window; 0 once it has closed. */
export function returnWindowHoursLeft(o: Order, now: number = Date.now()): number {
  if (!o.delivered_at) return 0;
  const elapsed = (now - new Date(o.delivered_at).getTime()) / MS_PER_HOUR;
  return Math.max(0, RETURN_WINDOW_HOURS - elapsed);
}

/**
 * Delivered, un-cancelled, no prior return, and still inside the window.
 * Note `delivered_at` is only present on the detail endpoint, so this is
 * always false for an order taken straight from the list.
 */
export function canRequestReturn(o: Order, now: number = Date.now()): boolean {
  if (o.status !== 'Delivered' || isOrderCancelled(o) || o.return_id || !o.delivered_at)
    return false;
  return returnWindowHoursLeft(o, now) > 0;
}

/* ── Seller order split ─────────────────────────────────────────────────────
 * The seller's Orders tab is split by what the seller must DO: accept new
 * orders, pack accepted ones, and see the ones that were rejected. Everything
 * after packing (collection → delivery) is the platform's work and sits in
 * `inProgress` / `delivered`. Keyed off `status`, never `stage` (stage is an
 * index into the order's own route map). */
export interface SellerOrderGroups {
  /** New orders the seller must accept (or decline) before the deadline. */
  toAccept: Order[];
  /** Accepted orders waiting to be packed for the VCO. */
  toPack: Order[];
  /** Cancelled for any reason — declined, missed window, customer or admin. */
  rejected: Order[];
  /** Packed and moving through collection / delivery. */
  inProgress: Order[];
  delivered: Order[];
}

export function groupSellerOrders(orders: Order[]): SellerOrderGroups {
  const g: SellerOrderGroups = {
    toAccept: [],
    toPack: [],
    rejected: [],
    inProgress: [],
    delivered: [],
  };
  for (const o of orders) {
    if (isOrderCancelled(o)) g.rejected.push(o);
    else if (o.status === 'Order Received') g.toAccept.push(o);
    else if (o.status === 'Order Accepted') g.toPack.push(o);
    else if (o.status === 'Delivered') g.delivered.push(o);
    else g.inProgress.push(o);
  }
  // Most urgent first: the accept queue by deadline (soonest auto-cancel on top).
  const deadline = (o: Order) =>
    o.accept_deadline ? new Date(o.accept_deadline).getTime() : Number.POSITIVE_INFINITY;
  g.toAccept.sort((a, b) => deadline(a) - deadline(b));
  return g;
}

/** Who caused a rejection, read from the server-authored cancel_reason. */
export type SellerRejectKind = 'declined' | 'missed' | 'other';

export function sellerRejectKind(o: Order): SellerRejectKind {
  const r = String(o.cancel_reason ?? '');
  if (/^Declined by seller/i.test(r)) return 'declined';
  if (/^Auto-cancelled/i.test(r)) return 'missed';
  return 'other';
}

/** The seller's own words after "Declined by seller:", if they gave a reason. */
export function sellerDeclineNote(o: Order): string {
  const m = /^Declined by seller:\s*(.+)$/i.exec(String(o.cancel_reason ?? ''));
  return m ? m[1].trim() : '';
}

/** Whole minutes until the accept deadline (0 once passed), or null with none. */
export function acceptMinutesLeft(o: Order, now: number = Date.now()): number | null {
  if (!o.accept_deadline) return null;
  return Math.max(0, Math.floor((new Date(o.accept_deadline).getTime() - now) / 60000));
}

export interface ConsumerOrderGroups {
  /** In-flight orders, shown as tracking cards. */
  active: Order[];
  /** Successfully delivered. */
  delivered: Order[];
  /** Delivered or cancelled — the "past orders" list. */
  past: Order[];
}

export function groupConsumerOrders(orders: Order[]): ConsumerOrderGroups {
  return {
    active: orders.filter(isOrderActive),
    delivered: orders.filter((o) => o.status === 'Delivered'),
    past: orders.filter((o) => o.status === 'Delivered' || isOrderCancelled(o)),
  };
}

export interface OrderCharges {
  itemTotal: number;
  handling: number;
  /** Flat multi-farmer fee, recovered from the persisted totals. */
  marketFee: number;
  delivery: number;
  total: number;
  saved: number;
}

/**
 * Split a persisted order back into its charge lines.
 *
 * The consumer-facing market fee (flat ₹10 when a cart spans 2+ farmers) is
 * deliberately not stored, so it is recovered as the residual
 * `total − item_total − handling − delivery`. Float noise leaves that residual
 * a hair above zero on fee-free orders, hence the half-paisa floor.
 *
 * Do NOT substitute the `market_fee` column here. Despite the name it holds the
 * platform's revenue margin (consumer price − farmer price), is already baked
 * into `item_total`, and must never surface on a customer's receipt.
 * See backend/routes/orders.js:154.
 */
export function deriveOrderCharges(o: Order): OrderCharges {
  const num = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
  const itemTotal = num(o.item_total);
  const handling = num(o.handling);
  const delivery = num(o.delivery);
  const total = num(o.total);
  const residual = total - itemTotal - handling - delivery;
  return {
    itemTotal,
    handling,
    marketFee: residual > 0.005 ? residual : 0,
    delivery,
    total,
    saved: num(o.saved),
  };
}

/** Line total for an item, coercing the numeric-as-string price. */
export function itemLineTotal(item: OrderItem): number {
  return (parseFloat(String(item.price ?? 0)) || 0) * item.qty;
}
