import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { neutral } from '@marutham/tokens';
import { type TrackResponse } from '@marutham/api-client';
import { buildPipeline, statusKey } from '@marutham/lib';
import type { LatLng } from '../../components/OrderMap';

// Lazy so the Google Maps SDK chunk loads only when a live tracker is actually
// shown, and never at all without an API key configured (isMapsConfigured gates
// the caller). Kept here, not in OrderDetailSheet, so the map stays code-split.
const OrderMap = lazy(() => import('../../components/OrderMap'));

/** Height of the map hero, in px. */
const MAP_H = 300;

/** "just now" / "2m ago" for the live-dot freshness caption. Mirrors OrderMap's own
 *  helper — duplicated (six lines) rather than imported so this file never pulls the
 *  map chunk in eagerly and defeats the lazy split above. */
function ago(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export interface MapView {
  dest: LatLng | null;
  agent: (LatLng & { at?: string | null }) | null;
  dispatch: LatLng | null;
  delivered: LatLng | null;
}

/**
 * Swiggy/Zomato-style live-order hero: a full-bleed map on top with the agent dot
 * gliding along the road route, a big ETA/status banner, a compact horizontal
 * progress stepper, and a delivery-partner card with a tap-to-call button.
 *
 * Shown only for a single-parcel order that has coordinates to draw (the caller
 * builds `mapView` and gates on isMapsConfigured); otherwise the plain vertical
 * pipeline remains the fallback.
 */
export function LiveTracker({
  track,
  route,
  status,
  mapView,
}: {
  track: TrackResponse;
  /** The order's route ('direct' | 'hub'), for the stepper's stage list. */
  route: string;
  /** Canonical English status (honours the optimistic "Delivered" after confirm). */
  status: string;
  mapView: MapView;
}) {
  const { t } = useTranslation();
  // The road-route ETA bubbles up from the map; we headline it here.
  const [eta, setEta] = useState<{ duration: string; distance: string } | null>(null);

  const isDelivered = status === 'Delivered';
  const isOut = status === 'Out for Delivery';
  const arriving = !!eta && !isDelivered && isOut;

  const headline = arriving
    ? t('track.hero.arriving', 'Arriving in {{duration}}', { duration: eta!.duration })
    : t(statusKey(status), status);
  const subline = arriving
    ? t('track.hero.away', '{{distance}} away', { distance: eta!.distance })
    : isDelivered
      ? t('track.hero.deliveredSub', 'Delivered to your address')
      : t('track.hero.liveSub', 'We’ll keep this updated live');

  // The horizontal stepper, from the same source as the vertical pipeline so it
  // honours the optimistic status. Skipped (hub-only, on a direct route) stages drop.
  const steps = buildPipeline(route, status).filter((n) => !n.skipped);

  const agent = track.agent;
  const live = mapView.agent && !isDelivered;
  const freshness = mapView.agent ? ago(mapView.agent.at) : null;

  return (
    <div className="live-track">
      <div className="live-track__map">
        <Suspense fallback={<div style={{ height: MAP_H, background: neutral[200] }} />}>
          <OrderMap
            dest={mapView.dest}
            agent={mapView.agent}
            dispatch={mapView.dispatch}
            originKind={route === 'hub' ? 'hub' : 'farm'}
            delivered={mapView.delivered}
            height={MAP_H}
            hideChrome
            onEta={setEta}
          />
        </Suspense>
        {live ? (
          <span className="live-track__badge">
            <span className="live-track__pulse" /> {t('track.hero.live', 'LIVE')}
          </span>
        ) : null}
      </div>

      <div className="live-track__panel">
        <div className="live-track__eta">{headline}</div>
        <div className="live-track__sub">{subline}</div>

        <div className="live-track__steps" role="list">
          {steps.map((n, i) => (
            <div key={n.label} className="live-track__step" data-state={n.status} role="listitem">
              {i > 0 ? <span className="live-track__bar" aria-hidden="true" /> : null}
              <span className="live-track__dot" aria-hidden="true" />
              <span className="live-track__slabel">{t(statusKey(n.label), n.label)}</span>
            </div>
          ))}
        </div>

        {agent ? (
          <div className="live-track__agent">
            <span className="live-track__avatar" aria-hidden="true">
              {(agent.name || '?').trim().charAt(0).toUpperCase()}
            </span>
            <div className="live-track__who">
              <div className="live-track__name">{agent.name}</div>
              <div className="live-track__meta">
                {agent.vehicle ? `${agent.vehicle} · ` : ''}
                {live ? (
                  <span className="live-track__livetxt">
                    {t('track.hero.live', 'LIVE')}
                    {freshness ? ` · ${t('track.map.updated', 'updated')} ${freshness}` : ''}
                  </span>
                ) : (
                  t('track.hero.partner', 'Delivery Partner')
                )}
              </div>
            </div>
            {agent.phone ? (
              <a
                className="live-track__call"
                href={`tel:${agent.phone}`}
                aria-label={t('track.hero.callAgent', 'Call {{name}}', { name: agent.name })}
              >
                📞 {t('track.hero.call', 'Call')}
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
