import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner } from '@marutham/ui';
import {
  api,
  OfflineQueuedError,
  type EligibleAgent,
  type DeliveryHubCandidate,
} from '@marutham/api-client';
import type { Order } from '@marutham/lib';
import { useToast } from '../../../components/Toast';
import { useAuth } from '../../../auth/AuthContext';
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
  const { user: me } = useAuth();
  // A VCO flagged can_deliver may run this order to the consumer themselves — so the
  // verifying VCO can assign it to their own id, even where the matched list is empty
  // (they need not have this village in their service_areas to hand-carry it).
  const iCanDeliver = me?.role === 'admin' && me?.admin_role === 'VCO' && !!me?.can_deliver;
  const [order, setOrder] = useState<Order | null>(null);
  const [matched, setMatched] = useState<EligibleAgent[]>([]);
  const [all, setAll] = useState<EligibleAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState('direct');
  const [agentId, setAgentId] = useState('');
  // Destination hub for a via-hub order — candidates + the deterministic suggestion.
  const [deliveryHubs, setDeliveryHubs] = useState<DeliveryHubCandidate[]>([]);
  const [suggestedHubId, setSuggestedHubId] = useState<string | null>(null);
  const [deliveryHubId, setDeliveryHubId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setOrder(null);
    setError(null);
    setRoute('direct');
    setAgentId('');
    setDeliveryHubs([]);
    setSuggestedHubId(null);
    setDeliveryHubId('');
    setBusy(false); // the sheet stays mounted between orders — a finished verify
    // would otherwise leave the next order's button stuck on "Verifying…"
    // 'delivery' leg: the agent list is matched against the CONSUMER's delivery
    // village, because on a direct order this is the person who runs the parcel to
    // the door. Agents opt into villages via service_villages in their own profile.
    // The destination-hub candidates ride along so the "Transit to Hub" toggle is
    // instant (best-effort: a failure leaves an empty list, never blocks verify).
    Promise.all([
      api.getOrder(orderId),
      api.getEligibleAgents(orderId, 'delivery'),
      api.getDeliveryHubs(orderId).catch(() => null),
    ])
      .then(([ord, elig, hubs]) => {
        if (!active) return;
        setOrder(ord.order);
        setMatched(elig.matched || []);
        setAll(elig.all || []);
        // Only an agent who is available for duty today can be pre-selected — an
        // off-duty agent is not offered at all (see the ready-only lists below). If
        // none is on duty, leave the picker on "assign later"; a can_deliver VCO can
        // still choose to run it themselves.
        const best = (elig.matched || []).find((a) => a.ready_today);
        if (best) setAgentId(best.id);
        if (hubs) {
          setDeliveryHubs(hubs.hubs || []);
          setSuggestedHubId(hubs.suggested_hub_id);
          // Pre-select what the order already carries, else the suggestion.
          setDeliveryHubId(hubs.current_hub_id || hubs.suggested_hub_id || '');
        }
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
        // The destination hub only applies to a via-hub order (ignored for direct).
        delivery_hub_id: route === 'hub' ? deliveryHubId || undefined : undefined,
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

  // Only agents available for duty today are offered (Part 4): a Delivery Agent must
  // be on duty to be assignable. The verifying VCO themselves is offered separately
  // (Part 5) and is never in these lists.
  const matchedReady = matched.filter((a) => a.ready_today && a.id !== me?.id);
  const others = all.filter((a) => !matched.some((m) => m.id === a.id));
  const othersReady = others.filter((a) => a.ready_today && a.id !== me?.id);
  const noneOnDuty = matchedReady.length === 0 && othersReady.length === 0;

  // Option text carries the availability signal a <select> can't badge: whether
  // the agent is ready today, and how far their last GPS is from the drop.
  const agentLabel = (a: EligibleAgent) => {
    let s = a.name;
    if (a.same_hub) s += ` · 🏭 ${t('agent.verify.sameHub', 'Same hub')}`;
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
            <>
              {/* Destination hub — where the parcel transits to. Auto-suggested from
                  the consumer's delivery area; the VCO can override. */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--forest)',
                  margin: '6px 0 8px',
                }}
              >
                {t('agent.verify.destHub', 'Destination hub')}
              </div>
              {deliveryHubs.length ? (
                <select
                  className="a-select"
                  value={deliveryHubId}
                  onChange={(e) => setDeliveryHubId(e.target.value)}
                  aria-label={t('agent.verify.destHub', 'Destination hub')}
                  style={{ marginBottom: 8 }}
                >
                  <option value="">— {t('agent.verify.pickHub', 'Select a hub')} —</option>
                  {deliveryHubs.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.taluk ? ` · ${h.taluk}` : ''}
                      {h.id === suggestedHubId
                        ? ` · ⭐ ${t('agent.verify.suggested', 'Suggested')}`
                        : ''}
                      {h.distance_m != null
                        ? ` · ${t('agent.assign.km', { km: (h.distance_m / 1000).toFixed(1) })}`
                        : ''}
                    </option>
                  ))}
                </select>
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
                    'agent.verify.noHubs',
                    'No hub found for the delivery area. It will use the hub stamped at ordering.',
                  )}
                </div>
              )}
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
            </>
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
              {matchedReady.length ? (
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
                  ✓ {t('agent.verify.matched', { count: matchedReady.length })}
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
                  {noneOnDuty
                    ? iCanDeliver
                      ? t(
                          'agent.verify.noneOnDutySelf',
                          'No delivery agent is on duty. Deliver it yourself, or assign later.',
                        )
                      : t(
                          'agent.verify.noneOnDuty',
                          'No delivery agent is on duty right now. Assign later.',
                        )
                    : t(
                        'agent.verify.noMatch',
                        'No on-duty agent covers this village. Pick one below.',
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
                {/* Part 5: the verifying VCO can hand-carry it to the consumer. */}
                {iCanDeliver && me?.id ? (
                  <option value={me.id}>
                    🛵 {t('agent.verify.deliverMyself', 'Deliver it myself')}
                  </option>
                ) : null}
                {matchedReady.length ? (
                  <optgroup label={t('agent.verify.covers', 'Covers this village · on duty')}>
                    {matchedReady.map((a) => (
                      <option key={a.id} value={a.id}>
                        {agentLabel(a)}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {othersReady.length ? (
                  <optgroup label={t('agent.verify.others', 'Other agents on duty in district')}>
                    {othersReady.map((a) => (
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
