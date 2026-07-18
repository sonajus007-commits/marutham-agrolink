/* Hub Incharge queue — the last legacy admin section.
 *
 * A hub-routed order passes through the hub twice-over: it ARRIVES (In Transit →
 * At Hub — the Hub Incharge accepting custody, hub staff only) and then it is
 * HANDED OVER, which is two separate acts by two different people: the Hub
 * Incharge names the last-mile agent (POST /assign, which does NOT move the
 * status), and that agent then scans At Hub → Picked Up themselves. So this
 * screen's second queue assigns; it no longer advances.
 *
 * The rules mirror backend/routes/delivery.js POST /orders/:id/scan, which now
 * branches on STATUS rather than stage index — the two routes disagree about what
 * a stage number means. Encoding them here keeps the UI from offering a button the
 * server will refuse.
 *
 * TRAP: the ORDER LIST endpoint omits the `cancelled` column (see
 * project-order-domain-traps), so the legacy `!o.cancelled` filter silently let
 * cancelled orders sit in the queue. Use isOrderCancelled(), which also reads
 * the status. */
import { isOrderCancelled, type Order } from './orders';

export const HUB_ROUTE = 'hub';
/** Rolling in, awaiting the Hub Incharge's acceptance. */
export const HUB_ARRIVING_STATUS = 'In Transit';
/** Accepted into the hub, awaiting a last-mile agent assignment. */
export const HUB_READY_STATUS = 'At Hub';

/* Who may work the hub. Mirrors the isHubStaff test the /scan endpoint applies
 * to a hub dispatch — a Delivery Agent or VCO is NOT hub staff. */
export const HUB_STAFF_ROLES = [
  'Hub Incharge',
  'Head Office',
  'State Head',
  'Regional Manager',
  'District Manager',
] as const;

export function isHubStaff(adminRole?: string | null): boolean {
  return HUB_STAFF_ROLES.includes(adminRole as (typeof HUB_STAFF_ROLES)[number]);
}

/** An order actually routed through the hub, and still in flight. */
function liveHubOrder(o: Order): boolean {
  return o.route === HUB_ROUTE && !isOrderCancelled(o);
}

export function canCheckInAtHub(o: Order): boolean {
  return liveHubOrder(o) && o.status === HUB_ARRIVING_STATUS;
}

/** At Hub — the Hub Incharge may name the last-mile agent. Assignment is not a
 *  status change: the agent's own pickup scan is what moves it on. */
export function canAssignAtHub(o: Order): boolean {
  return liveHubOrder(o) && o.status === HUB_READY_STATUS;
}

export interface HubQueues {
  /** In Transit — rolling in, awaiting the Hub Incharge's acceptance. */
  arriving: Order[];
  /** At Hub — accepted, awaiting a last-mile agent. */
  ready: Order[];
}

/**
 * Split a hub-routed order list into the two queues the screen shows.
 * Defensive about the route even though the caller filters on it server-side:
 * a direct order can never be checked into a hub.
 */
export function groupHubQueue(orders: Order[]): HubQueues {
  return {
    arriving: orders.filter(canCheckInAtHub),
    ready: orders.filter(canAssignAtHub),
  };
}
