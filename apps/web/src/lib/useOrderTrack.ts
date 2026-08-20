import { useEffect, useState } from 'react';
import { api, type TrackResponse } from '@marutham/api-client';

/** How often an in-flight order re-checks its agent position / ETA. */
export const TRACK_POLL_MS = 30_000;

/**
 * Poll GET /orders/:id/track for one order or split parcel: a one-shot fetch when
 * the id appears (so even a just-delivered parcel gets its final map), then a 30 s
 * refresh while it is still in flight. Best-effort — a failed fetch keeps the last
 * good value and the next tick retries. A null id parks the hook (returns null).
 *
 * Shared by the consumer order sheet (each split part tracks itself) and the agent
 * deliver sheet (the agent watches their own live route to the door): the same
 * /track response feeds LiveOrderMap on both sides.
 */
export function useOrderTrack(orderId: string | null, live: boolean): TrackResponse | null {
  const [track, setTrack] = useState<TrackResponse | null>(null);
  useEffect(() => {
    if (!orderId) {
      setTrack(null);
      return;
    }
    let active = true;
    const load = () =>
      api
        .trackOrder(orderId)
        .then((tr) => {
          if (active) setTrack(tr);
        })
        .catch(() => {
          /* transient — a later tick (or the next open) retries */
        });
    load();
    if (!live) {
      return () => {
        active = false;
      };
    }
    const id = setInterval(load, TRACK_POLL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [orderId, live]);
  return track;
}
