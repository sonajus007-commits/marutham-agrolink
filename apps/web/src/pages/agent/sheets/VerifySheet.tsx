import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner, ActionBar } from '@marutham/ui';
import {
  api,
  OfflineQueuedError,
  type EligibleAgent,
  type DeliveryHubCandidate,
  type VerifyItem,
  type PackingQuality,
} from '@marutham/api-client';
import type { Order, OrderItem } from '@marutham/lib';
import { useToast } from '../../../components/Toast';
import { PhotoCapture } from '../../../components/PhotoCapture';
import { useAuth } from '../../../auth/AuthContext';
import { getCurrentPosition } from '../../../native/geolocation';
import { AgentPicker } from '../AgentPicker';
import { defaultAgentId } from '../agentPick';

/** The verified quantity per line, keyed by order_items.id. Pre-filled with the
 *  ordered quantity so the VCO only overwrites a line the scale disagrees with;
 *  a box they clear is null and keeps Verify disabled until it has a number. */
type Weighed = Record<string, number | null>;
/** One optional rating of how the seller packed the parcel — a suggestion only. */
const PACKING: PackingQuality[] = ['good', 'fair', 'poor'];
/** Up to this many collection photos (the server keeps the first 3). */
const MAX_PHOTOS = 3;

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
  // Two candidate lists, one per route: the DIRECT delivery agent (matched on the
  // consumer's village) and the HUB collection agent (matched on the fulfilment
  // village). Both are ranked by distance from the pickup point.
  const [direct, setDirect] = useState<{ matched: Set<string>; all: EligibleAgent[] }>({
    matched: new Set(),
    all: [],
  });
  const [collect, setCollect] = useState<{ matched: Set<string>; all: EligibleAgent[] }>({
    matched: new Set(),
    all: [],
  });
  const [radiusKm, setRadiusKm] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState('direct');
  const [agentId, setAgentId] = useState('');
  const [collectionAgentId, setCollectionAgentId] = useState('');
  // Destination hub for a via-hub order — candidates + the deterministic suggestion.
  const [deliveryHubs, setDeliveryHubs] = useState<DeliveryHubCandidate[]>([]);
  const [suggestedHubId, setSuggestedHubId] = useState<string | null>(null);
  const [deliveryHubId, setDeliveryHubId] = useState('');
  const [busy, setBusy] = useState(false);
  // Per-line verification (migration 059): the order's lines and the VCO's checks.
  const [items, setItems] = useState<OrderItem[]>([]);
  const [weighed, setWeighed] = useState<Weighed>({});
  // Optional packing rating (migration 066) and up to 3 collection photos (060).
  const [packing, setPacking] = useState<PackingQuality | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setOrder(null);
    setError(null);
    setRoute('direct');
    setAgentId('');
    setCollectionAgentId('');
    setDirect({ matched: new Set(), all: [] });
    setCollect({ matched: new Set(), all: [] });
    setDeliveryHubs([]);
    setSuggestedHubId(null);
    setDeliveryHubId('');
    setItems([]);
    setWeighed({});
    setPacking(null);
    setPhotos([]);
    setBusy(false); // the sheet stays mounted between orders — a finished verify
    // would otherwise leave the next order's button stuck on "Verifying…"
    // 'delivery' leg: the agent list is matched against the CONSUMER's delivery
    // village, because on a direct order this is the person who runs the parcel to
    // the door. Agents opt into villages via service_villages in their own profile.
    // The destination-hub candidates ride along so the "Transit to Hub" toggle is
    // instant (best-effort: a failure leaves an empty list, never blocks verify).
    // Distances are measured from where the VCO is standing (a quick fix, best-effort;
    // the server falls back to the farm pin), so agents nearest the parcel lead.
    getCurrentPosition(5_000)
      .catch(() => null)
      .then((here) =>
        Promise.all([
          api.getOrder(orderId),
          api.getEligibleAgents(orderId, 'delivery', here),
          api.getEligibleAgents(orderId, 'collection', here).catch(() => null),
          api.getDeliveryHubs(orderId).catch(() => null),
        ]),
      )
      .then(([ord, elig, coll, hubs]) => {
        if (!active) return;
        setOrder(ord.order);
        // Every line starts at the ordered quantity — the VCO overwrites only a
        // line whose weight differs.
        const lines = (ord.items || []).filter((it): it is OrderItem & { id: string } => !!it.id);
        setItems(lines);
        setWeighed(
          Object.fromEntries(
            lines.map((it) => {
              const n = Number(it.qty);
              return [it.id, Number.isFinite(n) ? n : null];
            }),
          ),
        );
        // Only an agent on duty today can be pre-selected — the nearest within the
        // radius, else one covering the village. None on duty → "assign later".
        const d = { matched: new Set((elig.matched || []).map((a) => a.id)), all: elig.all || [] };
        setDirect(d);
        setAgentId(defaultAgentId(d.all, d.matched, me?.id));
        if (elig.radius_km) setRadiusKm(elig.radius_km);
        if (coll) {
          const c = {
            matched: new Set((coll.matched || []).map((a) => a.id)),
            all: coll.all || [],
          };
          setCollect(c);
          setCollectionAgentId(defaultAgentId(c.all, c.matched, me?.id));
        }
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
    if (unweighedCount > 0) {
      toast(t('agent.verify.weighAll', 'Enter the verified quantity for every item.'), 'er');
      return;
    }
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
      // The weighed quantity of every line — the server refuses a verify without.
      const itemChecks: VerifyItem[] = items.map((it) => ({
        id: it.id as string,
        verified_qty: weighed[it.id as string] ?? null,
      }));
      // Collection points are rural and often have no signal, so this is queueable.
      // The stage guard matters most here: replayed a stage late, this same body would
      // land on the pick-up branch and make the VCO the delivery agent, silently
      // discarding the route and agent they chose.
      await api.verifyOrderOffline(orderId, stage, {
        route,
        // One agent per route — never both: each picker is pre-seeded on load, so the
        // hidden one's selection must not ride along when the toggle changes.
        agent_id: route === 'hub' ? undefined : agentId || undefined,
        collection_agent_id: route === 'hub' ? collectionAgentId || undefined : undefined,
        // The destination hub only applies to a via-hub order (ignored for direct).
        delivery_hub_id: route === 'hub' ? deliveryHubId || undefined : undefined,
        coords,
        items: itemChecks.length ? itemChecks : undefined,
        packing_quality: packing || undefined,
        proof_photos: photos.length ? photos : undefined,
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

  const unweighedCount = items.filter((it) => weighed[it.id as string] == null).length;

  const packingLabel = (q: PackingQuality) =>
    ({
      good: t('agent.verify.quality.good', 'Good'),
      fair: t('agent.verify.quality.fair', 'Fair'),
      poor: t('agent.verify.quality.poor', 'Poor'),
    })[q];

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

          {/* Per-line check, one compact row each: the item and its ordered quantity
              beside a small box pre-filled with that quantity. Tapping the box
              selects it, so typing a different weight overwrites it in one go. */}
          {items.length ? (
            <div className="a-card verify-items">
              <h3>⚖️ {t('agent.verify.itemsTitle', 'Check what you received')}</h3>
              <p style={{ margin: '2px 0 6px', fontSize: 12, color: 'var(--gray)' }}>
                {t(
                  'agent.verify.itemsHelp',
                  'Filled with the ordered quantity — change it only if the scale differs.',
                )}
              </p>
              {items.map((it) => {
                const id = it.id as string;
                const ordered = Number(it.qty) || 0;
                const qty = weighed[id] ?? null;
                const short = qty != null && qty < ordered;
                const changed = qty != null && qty !== ordered;
                return (
                  <div className="verify-line" key={id}>
                    <div className="verify-line__info">
                      <div className="verify-line__name">{it.name}</div>
                      <div className="verify-line__ordered">
                        {t('agent.verify.ordered', 'Ordered')}: {it.qty} {it.unit || ''}
                      </div>
                    </div>
                    <div className="verify-line__entry">
                      <input
                        id={`vq-${id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="any"
                        className={`verify-qty${changed ? ' verify-qty--changed' : ''}${
                          qty == null ? ' verify-qty--empty' : ''
                        }`}
                        value={qty ?? ''}
                        aria-label={`${t('agent.verify.received', 'Verified quantity')} · ${it.name}`}
                        onFocus={(e) => e.currentTarget.select()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const n = Number(raw);
                          setWeighed((prev) => ({
                            ...prev,
                            [id]: raw === '' || !Number.isFinite(n) ? null : Math.max(0, n),
                          }));
                        }}
                      />
                      {it.unit ? <span className="verify-line__unit">{it.unit}</span> : null}
                    </div>
                    {short ? (
                      <div className="verify-line__short">
                        ⚠️ {t('agent.verify.shortWarn', 'Less than ordered — the seller is told.')}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {/* Packing rating — one optional, advisory row in the same card. */}
              <div className="verify-packing">
                <span className="verify-packing__label">
                  📦 {t('agent.verify.packingTitle', 'Packing')}
                  <small>{t('agent.verify.packingHelp', 'Optional')}</small>
                </span>
                <div
                  className="quality-chips"
                  role="group"
                  aria-label={t('agent.verify.packingTitle', 'Packing')}
                >
                  {PACKING.map((q) => (
                    <button
                      type="button"
                      key={q}
                      className={`quality-chip quality-chip--${q}${packing === q ? ' on' : ''}`}
                      aria-pressed={packing === q}
                      // Tap the chosen one again to clear it — the rating is optional.
                      onClick={() => setPacking(packing === q ? null : q)}
                    >
                      {packingLabel(q)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {items.length ? (
            <div className="a-card">
              <h3>📷 {t('agent.verify.proofTitle', 'Collection photos')}</h3>
              <p style={{ margin: '2px 0 10px', fontSize: 12, color: 'var(--gray)' }}>
                {t(
                  'agent.verify.proofHelp',
                  'Optional — up to 3 photos of the goods you received.',
                )}
              </p>
              <div className="photo-set">
                {photos.map((p, i) => (
                  <PhotoCapture
                    key={i}
                    value={p}
                    onChange={(v) =>
                      setPhotos((prev) =>
                        v ? prev.map((x, j) => (j === i ? v : x)) : prev.filter((_, j) => j !== i),
                      )
                    }
                    label={t('agent.verify.proofAdd', 'Add photo')}
                  />
                ))}
                {photos.length < MAX_PHOTOS ? (
                  <PhotoCapture
                    key={`add-${photos.length}`}
                    value={null}
                    onChange={(v) => v && setPhotos((prev) => [...prev, v].slice(0, MAX_PHOTOS))}
                    label={t('agent.verify.proofAddN', 'Add photo ({{n}}/{{max}})', {
                      n: photos.length + 1,
                      max: MAX_PHOTOS,
                    })}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

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
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 400 }}>
                {t('agent.route.directSub', 'to consumer')}
              </span>
            </button>
            <button
              className={`route-btn ${route === 'hub' ? 'on' : ''}`}
              onClick={() => setRoute('hub')}
            >
              🏭 {t('agent.route.hub', 'Transit to Hub')}
              <br />
              <span style={{ fontSize: 'var(--fs-2xs)', fontWeight: 400 }}>
                {t('agent.route.hubSub', 'via hub')}
              </span>
            </button>
          </div>

          {/* A hub order: the VCO names who CARRIES it to the hub; the last-mile agent
              is the Hub Incharge's call once it has arrived. */}
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
              {/* Who carries it to the hub — they collect it here and hand it to the
                  Hub Incharge. The last-mile agent is still the hub's call. */}
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--forest)',
                  margin: '6px 0 8px',
                }}
              >
                {t('agent.verify.collectionAgent', 'Agent to carry it to the hub')}
              </div>
              <AgentPicker
                agents={collect.all}
                matchedIds={collect.matched}
                radiusKm={radiusKm}
                value={collectionAgentId}
                onChange={setCollectionAgentId}
                excludeId={me?.id}
                selfOption={
                  me?.id
                    ? {
                        id: me.id,
                        label: `🏭 ${t('agent.verify.carryMyself', 'Take it to the hub myself')}`,
                      }
                    : undefined
                }
                ariaLabel={t('agent.verify.collectionAgent', 'Agent to carry it to the hub')}
              />
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--gray)',
                  background: 'var(--surface-muted)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  margin: '10px 0 14px',
                }}
              >
                {t(
                  'agent.verify.hubAgentNote2',
                  'The agent hands it to the Hub Incharge. The hub assigns the last-mile delivery agent when it arrives.',
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
              <AgentPicker
                agents={direct.all}
                matchedIds={direct.matched}
                radiusKm={radiusKm}
                value={agentId}
                onChange={setAgentId}
                excludeId={me?.id}
                selfOption={
                  iCanDeliver && me?.id
                    ? {
                        id: me.id,
                        label: `🛵 ${t('agent.verify.deliverMyself', 'Deliver it myself')}`,
                      }
                    : undefined
                }
                ariaLabel={t('agent.verify.deliveryAgent', 'Delivery agent')}
              />
            </>
          )}

          {/* Sticky action bar so Verify stays under the thumb after scrolling past
              the route toggle, hub picker and agent list. */}
          <ActionBar
            sticky
            summary={
              unweighedCount > 0 ? (
                <span className="verify-gate" role="status">
                  ⚖️{' '}
                  {t('agent.verify.weighLeft', {
                    count: unweighedCount,
                    defaultValue: 'Enter the verified quantity for {{count}} more item(s).',
                  })}
                </span>
              ) : undefined
            }
          >
            <button
              className="confirm-btn"
              style={{
                marginTop: 0,
                boxShadow: 'none',
                borderRadius: 12,
                padding: 14,
                fontSize: 14,
              }}
              onClick={confirm}
              disabled={busy || unweighedCount > 0}
            >
              {busy
                ? `⏳ ${t('agent.verify.busy', 'Verifying…')}`
                : /* the hub route names a carrier; the hub assigns the last mile */
                  `✓ ${
                    route === 'hub'
                      ? t('agent.verify.ctaHub', 'Verify & Send to Hub')
                      : t('agent.verify.cta', 'Verify & Assign')
                  }`}
            </button>
          </ActionBar>
        </>
      )}
    </Sheet>
  );
}
