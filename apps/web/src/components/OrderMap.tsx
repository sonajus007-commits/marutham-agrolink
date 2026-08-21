import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { colors, neutral, statusPalette } from '@marutham/tokens';
import { loadGoogleMaps } from '../lib/googleMaps';

/* Live-tracking map for an order: the parcel's journey from the hub it was
 * dispatched from, through the delivery agent's live position, to the consumer's
 * destination. Consumes coordinates the caller already polled (GET /orders/:id/track)
 * — the agent dot moves as fresh `agentLoc` arrives, no polling of its own.
 *
 * Default export so it can be React.lazy()'d: the Google Maps SDK (a CDN script) is
 * only fetched when a map is actually shown, and never at all without an API key.
 * Best-effort: if the SDK can't load, the component quietly renders nothing and the
 * caller's pipeline stepper remains the source of truth. */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface OrderMapProps {
  /** Where the parcel is headed (the consumer's pin or a geocoded address). */
  dest?: LatLng | null;
  /** The delivery agent's last-known live position, plus when it was captured. */
  agent?: (LatLng & { at?: string | null }) | null;
  /** Where the parcel was picked up, when it has left on the last mile — the farmer's
   *  farm on the direct lane, the hub on the hub lane. */
  dispatch?: LatLng | null;
  /** What the pickup point IS, so the origin marker is labelled correctly. Defaults to
   *  'hub' (the original single meaning of `dispatch`). */
  originKind?: 'farm' | 'hub';
  /** Where it was actually delivered, once complete. */
  delivered?: LatLng | null;
  /** Map height in px (default 300). Hero layouts pass a taller value. */
  height?: number;
  /** Suppress the built-in ETA/live footer — the caller renders its own banner
   *  (the Swiggy-style hero owns that chrome). */
  hideChrome?: boolean;
  /** Bubble the live road-route ETA up so a caller can headline it. Pass a stable
   *  callback (e.g. a useState setter) — it fires whenever the ETA is recomputed. */
  onEta?: (eta: { duration: string; distance: string } | null) => void;
}

// Marker colours are design tokens, not hex literals (the tokens:literals gate
// forbids raw colour in app code). Each point borrows the token that already means
// it: the hub violet for dispatch, the on-the-move green for the live agent, the
// Delivered green for proof of delivery, and the brand accent for the destination pin
// (red stays reserved for status/cancelled, so it is deliberately not used here).
const COLORS = {
  dispatch: statusPalette['At Hub'], // hub violet — dispatched from the hub
  agent: colors.green, // green — live, moving
  dest: colors.bloom, // brand accent — destination pin
  delivered: statusPalette.Delivered, // dark green — proof of delivery
};

/** "just now" / "2m ago" from an ISO timestamp, for the live-dot freshness caption. */
function ago(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export default function OrderMap({
  dest,
  agent,
  dispatch,
  originKind = 'hub',
  delivered,
  height = 300,
  hideChrome = false,
  onEta,
}: OrderMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GMapsApi | null>(null);
  const mapRef = useRef<GMapsMap | null>(null);
  const markersRef = useRef<Record<string, GMapsMarker>>({});
  // Handle of the in-flight agent-dot glide, so a fresh ping cancels the old tween
  // and the dot doesn't fight itself between two targets.
  const agentAnimRef = useRef<number | null>(null);
  const lineRef = useRef<GMapsPolyline | null>(null);
  const dirServiceRef = useRef<GMapsDirectionsService | null>(null);
  const dirRendererRef = useRef<GMapsDirectionsRenderer | null>(null);
  // The origin→dest key the road route was last requested for. Directions is billed
  // per request, so we only re-ask when the parcel has actually moved to a new key
  // (coords rounded to ~100 m), not on every 30 s poll.
  const lastRouteKeyRef = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [eta, setEta] = useState<{ duration: string; distance: string } | null>(null);

  // Load the SDK and create the map once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((api) => {
      if (cancelled || !containerRef.current) return;
      if (!api) {
        setFailed(true);
        return;
      }
      // Even with a loaded SDK, map construction can throw (bad key, quota, a
      // half-initialised API). Fall back to the pipeline stepper rather than hang.
      try {
        apiRef.current = api;
        mapRef.current = new api.Map(containerRef.current, {
          zoom: 12,
          center: dest ?? agent ?? dispatch ?? { lat: 11.0, lng: 78.0 }, // Tamil Nadu-ish
          disableDefaultUI: true,
          clickableIcons: false,
        });
        setReady(true);
      } catch {
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
    // Intentionally run once — the draw effect below keeps it in sync afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Draw / update markers + route line + viewport whenever a coordinate changes.
  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    if (!ready || !api || !map) return;

    const points: Array<{ key: string; pos: LatLng; color: string; title: string }> = [];
    if (dispatch)
      points.push({
        key: 'dispatch',
        pos: dispatch,
        color: COLORS.dispatch,
        title:
          originKind === 'farm'
            ? t('track.map.dispatchFarm', 'Picked up from farm')
            : t('track.map.dispatch', 'Dispatched from hub'),
      });
    if (agent)
      points.push({
        key: 'agent',
        pos: { lat: agent.lat, lng: agent.lng },
        color: COLORS.agent,
        title: t('track.map.agent', 'Delivery agent'),
      });
    if (delivered)
      points.push({
        key: 'delivered',
        pos: delivered,
        color: COLORS.delivered,
        title: t('track.map.delivered', 'Delivered here'),
      });
    if (dest)
      points.push({
        key: 'dest',
        pos: dest,
        color: COLORS.dest,
        title: t('track.map.dest', 'Delivery address'),
      });

    // Glide the agent dot from where it is to its new ping over ~0.9s, so it reads
    // as movement rather than teleporting between polls (Swiggy's moving scooter).
    // Everything else snaps. Linear lat/lng interpolation is plenty at last-mile
    // distances — no geometry library needed (the loader doesn't include one).
    const animateAgent = (marker: GMapsMarker, to: LatLng) => {
      const cur = marker.getPosition?.();
      const from = cur ? { lat: cur.lat(), lng: cur.lng() } : null;
      if (!from) {
        marker.setPosition(to);
        return;
      }
      const dLat = to.lat - from.lat;
      const dLng = to.lng - from.lng;
      if (Math.hypot(dLat, dLng) < 1e-6) {
        marker.setPosition(to);
        return;
      }
      if (agentAnimRef.current != null) cancelAnimationFrame(agentAnimRef.current);
      const dur = 900;
      const t0 = performance.now();
      const tick = (now: number) => {
        const prog = Math.min(1, (now - t0) / dur);
        const e = prog < 0.5 ? 2 * prog * prog : 1 - (-2 * prog + 2) ** 2 / 2; // easeInOutQuad
        marker.setPosition({ lat: from.lat + dLat * e, lng: from.lng + dLng * e });
        agentAnimRef.current = prog < 1 ? requestAnimationFrame(tick) : null;
      };
      agentAnimRef.current = requestAnimationFrame(tick);
    };

    // Upsert each marker (reuse so the agent dot animates its move, not blinks).
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.key);
      const existing = markersRef.current[p.key];
      if (existing) {
        if (p.key === 'agent') animateAgent(existing, p.pos);
        else existing.setPosition(p.pos);
      } else {
        markersRef.current[p.key] = new api.Marker({
          position: p.pos,
          map,
          title: p.title,
          zIndex: p.key === 'agent' ? 3 : p.key === 'dest' ? 2 : 1,
          icon: {
            path: api.SymbolPath.CIRCLE,
            scale: p.key === 'agent' ? 9 : 7,
            fillColor: p.color,
            fillOpacity: 1,
            strokeColor: colors.white,
            strokeWeight: 2,
          },
        });
      }
    }
    // Drop any marker whose point disappeared (e.g. agent unassigned).
    for (const key of Object.keys(markersRef.current)) {
      if (!seen.has(key)) {
        markersRef.current[key].setMap(null);
        delete markersRef.current[key];
      }
    }

    // Frame everything. A single point just centres (fitBounds on one point zooms
    // in absurdly far).
    if (points.length === 1) {
      map.setCenter(points[0].pos);
      map.setZoom(14);
    } else if (points.length > 1) {
      const bounds = new api.LatLngBounds();
      for (const p of points) bounds.extend(p.pos);
      map.fitBounds(bounds, 48);
    }
  }, [ready, dest, agent, dispatch, originKind, delivered, t]);

  // The route line + ETA. Prefer a real road route (Directions API) from where the
  // parcel is NOW (the live agent, else the dispatch hub) to the destination; fall
  // back to a straight geodesic line when routing isn't possible or fails. Directions
  // is billed per request, so we round the endpoints to ~100 m and only re-request
  // when that key changes — an agent inching along won't rack up calls.
  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    if (!ready || !api || !map) return;

    // Draw the straight fallback line through the journey, and clear any road route.
    const drawStraightLine = () => {
      if (dirRendererRef.current) dirRendererRef.current.setMap(null);
      lastRouteKeyRef.current = null;
      setEta(null);
      const path = [
        dispatch,
        agent ? { lat: agent.lat, lng: agent.lng } : null,
        delivered ?? dest,
      ].filter((p): p is LatLng => Boolean(p));
      if (path.length >= 2) {
        if (lineRef.current) {
          lineRef.current.setPath(path);
          lineRef.current.setMap(map);
        } else {
          lineRef.current = new api.Polyline({
            path,
            map,
            geodesic: true,
            strokeColor: neutral[400],
            strokeOpacity: 0.9,
            strokeWeight: 3,
          });
        }
      } else if (lineRef.current) {
        lineRef.current.setMap(null);
      }
    };

    // Route only the REMAINING journey to the door: from the live agent (or, before
    // pickup, the dispatch hub) to the destination. A delivered parcel has arrived —
    // no ETA to compute — and with no origin or destination there's nothing to route.
    const origin = agent ? { lat: agent.lat, lng: agent.lng } : (dispatch ?? null);
    const canRoute = !delivered && origin && dest;
    if (!canRoute) {
      drawStraightLine();
      return;
    }

    const key = `${origin.lat.toFixed(3)},${origin.lng.toFixed(3)}->${dest.lat.toFixed(3)},${dest.lng.toFixed(3)}`;
    if (key === lastRouteKeyRef.current) return; // unchanged since last request — keep the drawn route + ETA

    let cancelled = false;
    if (!dirServiceRef.current) dirServiceRef.current = new api.DirectionsService();
    if (!dirRendererRef.current) {
      dirRendererRef.current = new api.DirectionsRenderer({
        map,
        suppressMarkers: true, // we draw our own agent / destination markers
        preserveViewport: true, // the marker effect already framed the map
        polylineOptions: { strokeColor: COLORS.agent, strokeOpacity: 0.9, strokeWeight: 4 },
      });
    }

    dirServiceRef.current
      .route({ origin, destination: dest, travelMode: api.TravelMode?.DRIVING ?? 'DRIVING' })
      .then((result) => {
        if (cancelled) return;
        lastRouteKeyRef.current = key;
        if (lineRef.current) lineRef.current.setMap(null); // hide the straight fallback
        dirRendererRef.current!.setMap(map);
        dirRendererRef.current!.setDirections(result);
        const leg = result.routes[0]?.legs[0];
        setEta(
          leg?.duration && leg?.distance
            ? { duration: leg.duration.text, distance: leg.distance.text }
            : null,
        );
      })
      .catch(() => {
        // No route (islands, bad coords) or an API/quota error — the straight line
        // still conveys direction. Don't cache the key, so a later tick can retry.
        if (!cancelled) drawStraightLine();
      });

    return () => {
      cancelled = true;
    };
  }, [ready, dest, agent, dispatch, delivered]);

  // Surface the ETA to a caller that wants to headline it (the hero banner). The
  // callback should be stable (a setState), so this only fires when the ETA changes.
  useEffect(() => {
    onEta?.(eta);
  }, [eta, onEta]);

  // Stop any in-flight agent glide when the map unmounts.
  useEffect(
    () => () => {
      if (agentAnimRef.current != null) cancelAnimationFrame(agentAnimRef.current);
    },
    [],
  );

  if (failed) return null; // SDK unavailable — caller's stepper carries the tracking.

  const freshness = agent ? ago(agent.at) : null;

  return (
    <div style={{ marginTop: hideChrome ? 0 : 12 }}>
      <div
        ref={containerRef}
        role="img"
        aria-label={t('track.map.label', 'Map of the order’s delivery route')}
        style={{
          width: '100%',
          height,
          borderRadius: 12,
          overflow: 'hidden',
          background: neutral[200],
        }}
      />
      {!hideChrome && eta ? (
        <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: neutral[700] }}>
          🚗 {t('track.map.eta', '{{duration}} away', { duration: eta.duration })}
          <span style={{ fontWeight: 400 }}> · {eta.distance}</span>
        </div>
      ) : null}
      {!hideChrome && agent ? (
        <div style={{ marginTop: 6, fontSize: 12, color: neutral[700] }}>
          <span style={{ color: COLORS.agent }}>●</span> {t('track.map.live', 'Agent live')}
          {freshness ? ` · ${t('track.map.updated', 'updated')} ${freshness}` : ''}
        </div>
      ) : null}
    </div>
  );
}
