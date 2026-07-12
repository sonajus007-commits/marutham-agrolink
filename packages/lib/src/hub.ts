/* Hub Incharge queue — the last legacy admin section.
 *
 * A hub-routed order passes through the hub twice-over: it arrives (In Transit →
 * At Hub, a plain scan) and then leaves on its last mile (At Hub → Out for
 * Delivery, which also assigns the delivery agent). Those two states are the
 * whole screen.
 *
 * The stage rules mirror backend/routes/delivery.js POST /orders/:id/scan: hub
 * dispatch is only legal for `route === 'hub'` at stage 5 (At Hub), and only for
 * hub staff. Encoding them here keeps the UI from offering a button the server
 * will refuse.
 *
 * TRAP: the ORDER LIST endpoint omits the `cancelled` column (see
 * project-order-domain-traps), so the legacy `!o.cancelled` filter silently let
 * cancelled orders sit in the queue. Use isOrderCancelled(), which also reads
 * the status. */
import { isOrderCancelled, type Order } from './orders';

export const HUB_ROUTE = 'hub';
/** Awaiting check-in at the hub (stage 4). */
export const HUB_ARRIVING_STATUS = 'In Transit';
/** Checked in, awaiting last-mile dispatch (stage 5). */
export const HUB_READY_STATUS = 'At Hub';

/* Who may work the hub. Mirrors the isHubStaff test the /scan endpoint applies
 * to a hub dispatch — a Delivery Agent or VCO is NOT hub staff. */
export const HUB_STAFF_ROLES = [
  'Hub Incharge', 'Head Office', 'State Head', 'Regional Manager', 'District Manager',
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

export function canDispatchFromHub(o: Order): boolean {
  return liveHubOrder(o) && o.status === HUB_READY_STATUS;
}

export interface HubQueues {
  /** In Transit — rolling in, awaiting check-in. */
  arriving: Order[];
  /** At Hub — checked in, ready to dispatch on the last mile. */
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
    ready: orders.filter(canDispatchFromHub),
  };
}
