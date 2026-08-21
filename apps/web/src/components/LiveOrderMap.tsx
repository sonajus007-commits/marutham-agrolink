import { lazy, Suspense } from 'react';
import { neutral } from '@marutham/tokens';
import type { TrackResponse } from '@marutham/api-client';
import { isMapsConfigured } from '../lib/googleMaps';

// Lazy so the Google Maps SDK chunk loads only when a live map is actually shown,
// and never at all without an API key configured.
const OrderMap = lazy(() => import('./OrderMap'));

const pt = (lat?: number | null, lng?: number | null) =>
  typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null;

/**
 * The live-tracking map for ONE order — a single-parcel order, or one seller's
 * parcel within a split order (each part is its own trackable order with its own
 * agent, so it gets its own map). Fed from a polled GET /orders/:id/track response.
 *
 * Renders only when Google Maps is configured AND the parcel has a destination plus
 * at least one journey point to draw (the live agent, the dispatch hub, or where it
 * was delivered); otherwise nothing, and the caller's pipeline stepper carries the
 * tracking on its own. Keeps the SDK-heavy OrderMap lazy so its chunk loads only when
 * a map is shown.
 */
export function LiveOrderMap({ track }: { track: TrackResponse | null }) {
  const to = track?.order;
  const dest = pt(to?.dest_lat, to?.dest_lng);
  const agent = track?.agentLoc
    ? { lat: track.agentLoc.lat, lng: track.agentLoc.lng, at: track.agentLoc.at }
    : null;
  const dispatch = pt(to?.dispatched_lat, to?.dispatched_lng);
  const delivered = pt(to?.delivered_lat, to?.delivered_lng);
  // The pickup origin is the farmer on the direct lane, the hub on the hub lane — so
  // the origin marker is labelled for what it actually is.
  const originKind = to?.route === 'hub' ? 'hub' : 'farm';

  if (!isMapsConfigured() || !dest || !(agent || dispatch || delivered)) return null;

  return (
    <Suspense
      fallback={
        <div style={{ height: 300, marginTop: 12, borderRadius: 12, background: neutral[200] }} />
      }
    >
      <OrderMap
        dest={dest}
        agent={agent}
        dispatch={dispatch}
        originKind={originKind}
        delivered={delivered}
      />
    </Suspense>
  );
}
