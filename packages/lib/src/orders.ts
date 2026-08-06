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
}

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
}

export interface OrderDetail {
  order: Order;
  items: OrderItem[];
  history: OrderHistoryEntry[];
  qr_svg?: string;
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
    toVerify: orders.filter(active('Packaged')),
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

/** Derive the 3 header stats, role-aware (VCO vs Delivery Agent). */
export function deriveAgentStats(q: OrderQueues, isVCO: boolean): AgentStats {
  const queue =
    (isVCO ? q.toVerify.length : q.toCollect.length) +
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

/** Statuses at which a consumer may still cancel (backend stages 0 and 1). */
export const CANCELLABLE_STATUSES: readonly string[] = ['Order Placed', 'Packaged'];

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
