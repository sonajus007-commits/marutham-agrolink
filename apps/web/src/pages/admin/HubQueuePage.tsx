import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, EmptyState, Modal, Select, Spinner, StatTile } from '@marutham/ui';
import { api, ApiError, type EligibleAgent } from '@marutham/api-client';
import { fmtDate, fmtMoney, groupHubQueue, payMethodKey, type Order } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { useAdminGeo } from './AdminGeoContext';
import { AdminGeoFilter } from './AdminGeoFilter';
import { FactoryDuo, TruckDuo } from '../../components/icons';

/* Hub Incharge queue — the last section the legacy console still owned.
 *
 * A hub-routed order meets the hub twice. It ARRIVES: the Incharge accepts it
 * into the hub (In Transit → At Hub), a custody event only hub staff may do. Then
 * it is HANDED OVER, which is deliberately two acts by two people — the Incharge
 * NAMES the last-mile agent (POST /assign, no status change) and that agent scans
 * their own pickup (At Hub → Picked Up) out in the agent app. So the second button
 * here assigns; it does not advance the order.
 *
 * The list is fetched with ?route=hub and scoped server-side, so a District
 * Manager sees their district's hub and a Hub Incharge sees theirs. Stage rules
 * come from @marutham/lib/hub, which mirrors what POST /scan will actually
 * accept, so the screen never offers a button the server would refuse. */

export function HubQueuePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.getOrders({ route: 'hub' });
      setOrders(res.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.hub.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filter the hub queue to the console-wide district pick. A Hub Incharge is
  // already scoped to their own hub server-side (the bar is hidden for them);
  // Head Office sees every hub and can drill into one district here.
  const { inGeoScope } = useAdminGeo();
  const scoped = orders.filter((o) => inGeoScope(o.district));
  const { arriving, ready } = groupHubQueue(scoped);

  /** Accepting a parcel into the hub is a scan; its STATUS (In Transit) is what
   *  gives it meaning server-side, and the server refuses it for non-hub staff. */
  async function checkIn(order: Order) {
    setBusyId(order.id);
    try {
      const res = await api.scanOrder(order.id);
      toast(res.message || t('admin.hub.checkedIn'), 'ok');
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.hub.actionFailed'), 'er');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">🏭 {t('admin.hub.title')}</h1>
      <p className="mb-4 text-2xs text-fg-muted">
        {user?.district
          ? t('admin.hub.subDistrict', { district: user.district })
          : t('admin.hub.sub')}
      </p>

      <AdminGeoFilter className="mb-4" />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile
          label={t('admin.hub.arriving')}
          value={String(arriving.length)}
          icon={<TruckDuo />}
          tone="green"
        />
        <StatTile
          label={t('admin.hub.ready')}
          value={String(ready.length)}
          icon={<FactoryDuo />}
          tone="green"
        />
      </div>

      {error ? (
        <p className="mb-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6">
          <Section title={t('admin.hub.arrivingSection', { count: arriving.length })}>
            {arriving.length === 0 ? (
              <EmptyState icon="🚚">{t('admin.hub.noArriving')}</EmptyState>
            ) : (
              arriving.map((o) => (
                <HubCard
                  key={o.id}
                  order={o}
                  tone="arriving"
                  toneLabel={t('admin.hub.awaitingCheckin')}
                  action={
                    <Button block disabled={busyId === o.id} onClick={() => void checkIn(o)}>
                      {busyId === o.id ? '…' : `✓ ${t('admin.hub.markArrived')}`}
                    </Button>
                  }
                />
              ))
            )}
          </Section>

          <Section title={t('admin.hub.readySection', { count: ready.length })}>
            {ready.length === 0 ? (
              <EmptyState icon="🏭">{t('admin.hub.noReady')}</EmptyState>
            ) : (
              ready.map((o) => (
                <HubCard
                  key={o.id}
                  order={o}
                  tone="ready"
                  toneLabel={t('admin.hub.readyToDispatch')}
                  action={
                    <Button block onClick={() => setDispatching(o)}>
                      🛵{' '}
                      {o.agent_name
                        ? t('admin.hub.reassign', 'Reassign Agent')
                        : t('admin.hub.assign', 'Assign Agent')}
                    </Button>
                  }
                />
              ))
            )}
          </Section>
        </div>
      )}

      <DispatchModal
        order={dispatching}
        onClose={() => setDispatching(null)}
        onDone={() => {
          setDispatching(null);
          void load();
        }}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-2xs font-bold uppercase tracking-wide text-fg-muted">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

function HubCard({
  order,
  tone,
  toneLabel,
  action,
}: {
  order: Order;
  tone: 'arriving' | 'ready';
  toneLabel: string;
  action: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const bg = tone === 'arriving' ? 'var(--warning-bg)' : 'var(--success-bg)';
  const fg = tone === 'arriving' ? 'var(--warning-fg)' : 'var(--success-fg)';

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-fg">
            {order.code || order.id.slice(0, 8).toUpperCase()}
          </div>
          <div className="mt-0.5 text-2xs text-fg-muted">
            {fmtDate(order.created_at, i18n.language)}
            {order.agent_name ? ` · 🛵 ${order.agent_name}` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-bold text-fg">{fmtMoney(order.total)}</div>
          <div className="text-2xs text-fg-muted">
            {order.pay_method ? t(payMethodKey(order.pay_method), order.pay_method) : ''}
          </div>
        </div>
      </div>

      <span
        className="mb-3 inline-block rounded-sm px-2 py-1 text-2xs font-semibold"
        style={{ background: bg, color: fg }}
      >
        {toneLabel}
      </span>

      {order.village ? <div className="mb-3 text-2xs text-fg-muted">📍 {order.village}</div> : null}
      {typeof order.item_count === 'number' ? (
        <div className="mb-3 text-2xs text-fg-muted">
          {t('admin.hub.items', { count: order.item_count })}
        </div>
      ) : null}

      {action}
    </Card>
  );
}

/* Last-mile assignment. The server matches delivery agents to the consumer's
 * village and we preselect the first match — but "Assign later" stays a real
 * option, because a hub cannot hold an order hostage for want of an agent. */
function DispatchModal({
  order,
  onClose,
  onDone,
}: {
  order: Order | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();

  const [matched, setMatched] = useState<EligibleAgent[]>([]);
  const [others, setOthers] = useState<EligibleAgent[]>([]);
  const [village, setVillage] = useState<string | null>(null);
  const [agentId, setAgentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order) return;
    let active = true;
    setLoading(true);
    setAgentId('');
    api
      .getEligibleAgents(order.id, 'delivery')
      .then((res) => {
        if (!active) return;
        const m = res.matched || [];
        const all = res.all || [];
        setMatched(m);
        setOthers(all.filter((a) => !m.some((x) => x.id === a.id)));
        setVillage(res.village ?? null);
        // Auto-select the best coverer who is ready today (matched is ready-first).
        const best = m.find((a) => a.ready_today) || m[0];
        if (best) setAgentId(best.id);
      })
      .catch(() => active && toast(t('admin.hub.agentsFailed'), 'er'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [order, toast, t]);

  // Option text carries the availability signal a <select> can't badge.
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

  async function confirm() {
    if (!order) return;
    // Assignment is not a status change, so there is no stage to assert and nothing
    // a replay could mis-advance — the risk that made the old dispatch call assert
    // its stage is gone with the dispatch. An agent is required: "assign later"
    // would leave the parcel with no one able to scan it out of the hub.
    if (!agentId) {
      toast(t('admin.hub.agentRequired', 'Pick a delivery agent.'), 'er');
      return;
    }
    void submit(false);
  }

  // Does the assign, offering a senior admin one confirmed retry when the server
  // blocks an out-of-region agent. `force` is never sent silently — only after the
  // confirm below — so an out-of-region assignment always lands in the timeline.
  async function submit(force: boolean) {
    if (!order || !agentId) return;
    setBusy(true);
    try {
      const res = await api.assignAgent(order.id, agentId, force);
      toast(res.message || t('admin.hub.assigned', 'Delivery agent assigned.'), 'ok');
      onDone();
    } catch (e) {
      const payload =
        e instanceof ApiError && e.payload && typeof e.payload === 'object'
          ? (e.payload as { reason?: string; can_override?: boolean })
          : null;
      if (payload?.can_override && !force) {
        const msg = e instanceof Error ? e.message : '';
        setBusy(false);
        if (
          window.confirm(
            `${msg}\n\n${t('admin.hub.overrideConfirm', 'Assign anyway? This out-of-region assignment will be logged.')}`,
          )
        ) {
          void submit(true);
        }
        return;
      }
      toast(e instanceof Error ? e.message : t('admin.hub.actionFailed'), 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={!!order}
      title={`🛵 ${t('admin.hub.assignTitle', 'Assign Delivery Agent')}`}
      subtitle={order?.code || undefined}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('admin.hub.cancel')}
          </Button>
          <Button onClick={() => void confirm()} disabled={busy || loading}>
            {busy ? '…' : `🛵 ${t('admin.hub.assign', 'Assign Agent')}`}
          </Button>
        </>
      }
    >
      {loading ? (
        <Spinner />
      ) : (
        <>
          <p className="mb-2 text-2xs text-fg-muted">
            {t('admin.hub.deliveryVillage')}: <b className="text-primary">{village || '—'}</b>
          </p>

          <p
            className="mb-3 rounded-sm p-2 text-2xs"
            style={
              matched.length
                ? { background: 'var(--success-bg)', color: 'var(--success-fg)' }
                : { background: 'var(--warning-bg)', color: 'var(--warning-fg)' }
            }
          >
            {matched.length
              ? t('admin.hub.matched', { count: matched.length })
              : t('admin.hub.noMatch')}
          </p>

          <label
            className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
            htmlFor="hub-agent"
          >
            {t('admin.hub.agent')}
          </label>
          <Select id="hub-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            <option value="">— {t('admin.hub.pickAgent', 'Select an agent')} —</option>
            {matched.length ? (
              <optgroup label={t('admin.hub.covers', { village: village || '' })}>
                {matched.map((a) => (
                  <option key={a.id} value={a.id}>
                    {agentLabel(a)}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {others.length ? (
              <optgroup label={t('admin.hub.otherAgents')}>
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {agentLabel(a)}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </Select>
        </>
      )}
    </Modal>
  );
}
