import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner } from '@marutham/ui';
import { api, OfflineQueuedError, type EligibleAgent } from '@marutham/api-client';
import type { Order } from '@marutham/lib';
import { useToast } from '../../../components/Toast';
import { getCurrentPosition } from '../../../native/geolocation';

export function VerifySheet({
  open,
  orderId,
  onClose,
  onChanged,
}: {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [order, setOrder] = useState<Order | null>(null);
  const [matched, setMatched] = useState<EligibleAgent[]>([]);
  const [all, setAll] = useState<EligibleAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState('direct');
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setOrder(null);
    setError(null);
    setRoute('direct');
    setAgentId('');
    setBusy(false); // the sheet stays mounted between orders — a finished verify
    // would otherwise leave the next order's button stuck on "Verifying…"
    // 'delivery' leg: the agent list is matched against the CONSUMER's delivery
    // village, because on a direct order this is the person who runs the parcel to
    // the door. Agents opt into villages via service_villages in their own profile.
    Promise.all([api.getOrder(orderId), api.getEligibleAgents(orderId, 'delivery')])
      .then(([ord, elig]) => {
        if (!active) return;
        setOrder(ord.order);
        setMatched(elig.matched || []);
        setAll(elig.all || []);
        // Default to the best coverer who is ready today; matched is already sorted
        // ready-first, so matched[0] is that agent when any ready coverer exists.
        const best = (elig.matched || []).find((a) => a.ready_today) || (elig.matched || [])[0];
        if (best) setAgentId(best.id);
      })
      .catch(
        (e) =>
          active &&
          setError(e instanceof Error ? e.message : t('agent.err.order', 'Failed to load order')),
      );
    return () => {
      active = false;
    };
  }, [open, orderId]);

  async function confirm() {
    if (!orderId || !order) return;
    const stage = order.stage;
    // Every scan asserts the stage it saw, so without one there is nothing safe to
    // send. GET /orders/:id selects *, so this cannot happen in practice — but a
    // silent weaker request is worse than saying so.
    if (typeof stage !== 'number') {
      toast(
        t('agent.err.noStage', 'Could not read this order’s stage. Reload and try again.'),
        'er',
      );
      return;
    }
    setBusy(true);
    try {
      // Best-effort collection location; a declined permission never blocks verify.
      const coords = (await getCurrentPosition()) ?? undefined;
      // Collection points are rural and often have no signal, so this is queueable.
      // The stage guard matters most here: replayed a stage late, this same body would
      // land on the pick-up branch and make the VCO the delivery agent, silently
      // discarding the route and agent they chose.
      await api.verifyOrderOffline(orderId, stage, {
        route,
        // Never send an agent on a hub order: the picker is hidden for hub, but
        // agentId is auto-seeded from the village match on load, so switching the
        // toggle to hub would otherwise silently submit a stale pre-selection.
        agent_id: route === 'hub' ? undefined : agentId || undefined,
        coords,
      });
      /* Our own wording, not res.message: the server's is English prose composed
       * server-side ("Order advanced to: Picked Up."), so echoing it would put an
       * English sentence in a Tamil toast. Nothing is lost — verify has one outcome. */
      toast(t('agent.verify.done', 'Order verified.'), 'ok');
      onChanged();
    } catch (e) {
      if (e instanceof OfflineQueuedError) {
        toast(
          t('agent.queued', 'No signal — saved on your device. It will sync automatically.'),
          'ok',
        );
        onChanged();
        return;
      }
      toast(e instanceof Error ? e.message : t('agent.verify.failed', 'Verify failed'), 'er');
      setBusy(false);
    }
  }

  const others = all.filter((a) => !matched.some((m) => m.id === a.id));

  // Option text carries the availability signal a <select> can't badge: whether
  // the agent is ready today, and how far their last GPS is from the drop.
  const agentLabel = (a: EligibleAgent) => {
    let s = a.name;
    if (a.vehicle) s += ` · ${a.vehicle}`;
    s += a.ready_today
      ? ` · ✅ ${t('agent.assign.readyToday', 'Ready today')}`
      : ` · ⏸ ${t('agent.assign.away', 'Off duty')}`;
    if (a.distance_m != null) {
      s += ` · ${t('agent.assign.km', { km: (a.distance_m / 1000).toFixed(1) })}`;
    }
    return s;
  };

  return (
    <Sheet
      open={open}
      title={order?.code || t('agent.verify.title', 'Verify Order')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      {error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      ) : !order ? (
        <Spinner />
      ) : (
        <>
          <div className="a-card">
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--forest)' }}>
              {order.consumer_name || t('agent.consumer', 'Consumer')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
              {t('agent.verify.village', 'Fulfilment village:')} <b>{order.village || '—'}</b>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 8 }}>
            {t('agent.verify.route', 'Delivery route')}
          </div>
          <div className="route-toggle" style={{ marginBottom: 14 }}>
            <button
              className={`route-btn ${route === 'direct' ? 'on' : ''}`}
              onClick={() => setRoute('direct')}
            >
              🛵 {t('agent.route.direct', 'Direct Delivery')}
              <br />
              <span style={{ fontSize: 9, fontWeight: 400 }}>
                {t('agent.route.directSub', 'to consumer')}
              </span>
            </button>
            <button
              className={`route-btn ${route === 'hub' ? 'on' : ''}`}
              onClick={() => setRoute('hub')}
            >
              🏭 {t('agent.route.hub', 'Transit to Hub')}
              <br />
              <span style={{ fontSize: 9, fontWeight: 400 }}>
                {t('agent.route.hubSub', 'via hub')}
              </span>
            </button>
          </div>

          {/* A hub order gets its agent from the Hub Incharge once it has ARRIVED —
              until then nobody knows who will run the last mile, so asking the VCO
              to guess now would only produce an assignment the hub has to redo. */}
          {route === 'hub' ? (
            <div
              style={{
                fontSize: 11,
                color: 'var(--gray)',
                background: 'var(--surface-muted)',
                borderRadius: 8,
                padding: '10px 12px',
                margin: '6px 0 14px',
              }}
            >
              {t(
                'agent.verify.hubAgentNote',
                'This order travels to the hub first. The Hub Incharge assigns the delivery agent when it arrives.',
              )}
            </div>
          ) : (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--forest)',
                  margin: '6px 0 8px',
                }}
              >
                {t('agent.verify.deliveryAgent', 'Delivery agent')}
              </div>
              {matched.length ? (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--success-fg)',
                    background: 'var(--success-bg)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 8,
                  }}
                >
                  ✓ {t('agent.verify.matched', { count: matched.length })}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--warning-fg)',
                    background: 'var(--warning-bg)',
                    border: '1px solid var(--gold2)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    marginBottom: 8,
                  }}
                >
                  {t(
                    'agent.verify.noMatch',
                    'No agent is tagged to this village. Pick one manually.',
                  )}
                </div>
              )}
              <select
                className="a-select"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                aria-label={t('agent.verify.deliveryAgent', 'Delivery agent')}
              >
                <option value="">— {t('agent.verify.assignLater', 'Assign later')} —</option>
                {matched.length ? (
                  <optgroup label={t('agent.verify.covers', 'Covers this village')}>
                    {matched.map((a) => (
                      <option key={a.id} value={a.id}>
                        {agentLabel(a)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {others.length ? (
                  <optgroup label={t('agent.verify.others', 'Other agents in district')}>
                    {others.map((a) => (
                      <option key={a.id} value={a.id}>
                        {agentLabel(a)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </>
          )}

          <button
            className="confirm-btn"
            style={{ borderRadius: 12, padding: 14, fontSize: 14 }}
            onClick={confirm}
            disabled={busy}
          >
            {busy
              ? `⏳ ${t('agent.verify.busy', 'Verifying…')}`
              : /* nothing is assigned on the hub route — the hub does that later */
                `✓ ${
                  route === 'hub'
                    ? t('agent.verify.ctaHub', 'Verify & Send to Hub')
                    : t('agent.verify.cta', 'Verify & Assign')
                }`}
          </button>
        </>
      )}
    </Sheet>
  );
}
