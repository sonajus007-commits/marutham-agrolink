import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  /** The hub the parcel was dispatched from, when it has left on the last mile. */
  dispatch?: LatLng | null;
  /** Where it was actually delivered, once complete. */
  delivered?: LatLng | null;
}

const COLORS = {
  dispatch: '#2563eb', // blue — origin
  agent: '#16a34a', // green — live, moving
  dest: '#dc2626', // red — destination
  delivered: '#7c3aed', // violet — proof of delivery
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

export default function OrderMap({ dest, agent, dispatch, delivered }: OrderMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<GMapsApi | null>(null);
  const mapRef = useRef<GMapsMap | null>(null);
  const markersRef = useRef<Record<string, GMapsMarker>>({});
  const lineRef = useRef<GMapsPolyline | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // Load the SDK and create the map once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((api) => {
      if (cancelled || !api || !containerRef.current) {
        if (!cancelled && !api) setFailed(true);
        return;
      }
      apiRef.current = api;
      mapRef.current = new api.Map(containerRef.current, {
        zoom: 12,
        center: dest ?? agent ?? dispatch ?? { lat: 11.0, lng: 78.0 }, // Tamil Nadu-ish
        disableDefaultUI: true,
        clickableIcons: false,
      });
      setReady(true);
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
        title: t('track.map.dispatch', 'Dispatched from hub'),
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

    // Upsert each marker (reuse so the agent dot animates its move, not blinks).
    const seen = new Set<string>();
    for (const p of points) {
      seen.add(p.key);
      const existing = markersRef.current[p.key];
      if (existing) {
        existing.setPosition(p.pos);
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
            strokeColor: '#ffffff',
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

    // The route line, in journey order: hub → agent → (delivered or) destination.
    const path = [
      dispatch,
      agent ? { lat: agent.lat, lng: agent.lng } : null,
      delivered ?? dest,
    ].filter((p): p is LatLng => Boolean(p));
    if (path.length >= 2) {
      if (lineRef.current) {
        lineRef.current.setPath(path);
      } else {
        lineRef.current = new api.Polyline({
          path,
          map,
          geodesic: true,
          strokeColor: '#64748b',
          strokeOpacity: 0.9,
          strokeWeight: 3,
        });
      }
    } else if (lineRef.current) {
      lineRef.current.setMap(null);
      lineRef.current = null;
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
  }, [ready, dest, agent, dispatch, delivered, t]);

  if (failed) return null; // SDK unavailable — caller's stepper carries the tracking.

  const freshness = agent ? ago(agent.at) : null;

  return (
    <div style={{ marginTop: 12 }}>
      <div
        ref={containerRef}
        role="img"
        aria-label={t('track.map.label', 'Map of the order’s delivery route')}
        style={{
          width: '100%',
          height: 300,
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--neutral-100, #f1f5f9)',
        }}
      />
      {agent ? (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--neutral-700, #334155)' }}>
          <span style={{ color: COLORS.agent }}>●</span> {t('track.map.live', 'Agent live')}
          {freshness ? ` · ${t('track.map.updated', 'updated')} ${freshness}` : ''}
        </div>
      ) : null}
    </div>
  );
}
