/* Where a tapped phone notification should land.
 *
 * The push payload carries the same small routing `data` the bell row stores
 * ({order_id, code, …}) plus the notification `type` (utils/push.js). A tap arrives
 * on Capacitor's pushNotificationActionPerformed — possibly on a cold start, before
 * any portal has mounted — so the target is parked here until the portal that owns
 * the user's role picks it up with usePushTarget(). Each portal decides what the
 * target means for it (open an order sheet, switch a tab); a portal with no handler
 * (admin) just leaves the app on its home screen, as before. */
import { useEffect, useRef } from 'react';

export interface PushTarget {
  type: string;
  orderId: string | null;
}

type Handler = (target: PushTarget) => void;

let pending: PushTarget | null = null;
const handlers = new Set<Handler>();

/** Turn a tapped notification's data into a target and hand it to the mounted
 *  portal, or park it for the next one to mount. Unknown shapes are ignored. */
export function deliverPushTarget(data: unknown): void {
  if (!data || typeof data !== 'object') return;
  const d = data as Record<string, unknown>;
  const type = typeof d.type === 'string' ? d.type : '';
  const orderId = typeof d.order_id === 'string' && d.order_id ? d.order_id : null;
  if (!type && !orderId) return;
  const target = { type, orderId };
  if (handlers.size === 0) {
    pending = target;
    return;
  }
  pending = null;
  handlers.forEach((h) => h(target));
}

/** Drop a parked target — on sign-out, so the next user never inherits it. */
export function clearPushTarget(): void {
  pending = null;
}

/** Subscribe a portal to notification taps. A target parked before it mounted
 *  (the tap that launched the app) is delivered once, right after mount. */
export function usePushTarget(handler: Handler): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const h: Handler = (t) => ref.current(t);
    handlers.add(h);
    if (pending) {
      const t = pending;
      pending = null;
      h(t);
    }
    return () => {
      handlers.delete(h);
    };
  }, []);
}

/** True when this order (or, for a split parcel, its parent) is the one asked for.
 *  Sellers and agents see CHILD parcels, but some events carry the parent id. */
export function matchesOrder(
  o: { id?: unknown; parent_order_id?: unknown },
  orderId: string,
): boolean {
  return o.id === orderId || o.parent_order_id === orderId;
}
