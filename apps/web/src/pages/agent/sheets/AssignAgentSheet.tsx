import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner } from '@marutham/ui';
import { api, type EligibleAgent } from '@marutham/api-client';
import { pickupAssignment, type Order } from '@marutham/lib';
import { useToast } from '../../../components/Toast';
import { useAuth } from '../../../auth/AuthContext';
import { getCurrentPosition } from '../../../native/geolocation';
import { AgentPicker } from '../AgentPicker';
import { defaultAgentId } from '../agentPick';

/* VCO re-picks the pickup agent of a verified parcel still in their village —
 * after a decline or a timeout, or to swap someone who is waiting to accept.
 * The leg follows the route: direct → the delivery agent; hub → the agent carrying
 * it to the hub (POST /orders/:id/assign works the leg out server-side). */
export function AssignAgentSheet({
  open,
  order,
  onClose,
  onChanged,
}: {
  open: boolean;
  order: Order | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user: me } = useAuth();
  const [agents, setAgents] = useState<EligibleAgent[] | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [radiusKm, setRadiusKm] = useState(10);
  const [agentId, setAgentId] = useState('');
  const [busy, setBusy] = useState(false);
  const orderId = order?.id ?? null;
  const hub = order?.route === 'hub';

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setAgents(null);
    setAgentId('');
    setBusy(false);
    getCurrentPosition(5_000)
      .catch(() => null)
      .then((here) => api.getEligibleAgents(orderId, hub ? 'collection' : 'delivery', here))
      .then((res) => {
        if (!active) return;
        const m = new Set((res.matched || []).map((a) => a.id));
        setMatched(m);
        setAgents(res.all || []);
        if (res.radius_km) setRadiusKm(res.radius_km);
        setAgentId(defaultAgentId(res.all || [], m, me?.id));
      })
      .catch((e) => {
        if (!active) return;
        setAgents([]);
        toast(e instanceof Error ? e.message : t('agent.err.order', 'Failed to load order'), 'er');
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId, hub]);

  async function assign() {
    if (!orderId || !agentId) return;
    setBusy(true);
    try {
      await api.assignAgent(orderId, agentId);
      toast(t('agent.assign.sent', 'Job sent — waiting for the agent to accept.'), 'ok');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('agent.assign.failed', 'Could not assign'), 'er');
      setBusy(false);
    }
  }

  const current = order ? pickupAssignment(order) : null;
  const canSelf = hub || !!me?.can_deliver;

  return (
    <Sheet
      open={open}
      title={order?.code || t('agent.assign.title', 'Assign agent')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      {!agents ? (
        <Spinner />
      ) : (
        <>
          <div className="a-card">
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--forest)' }}>
              {hub
                ? t('agent.verify.collectionAgent', 'Agent to carry it to the hub')
                : t('agent.verify.deliveryAgent', 'Delivery agent')}
            </div>
            {current && current.state !== 'none' ? (
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                {current.state === 'pending'
                  ? t('agent.job.waiting', 'Waiting for {{name}} · {{min}} min left', {
                      name: current.name,
                      min: current.minutesLeft ?? 0,
                    })
                  : t('agent.job.accepted', '{{name}} accepted', { name: current.name })}
              </div>
            ) : null}
          </div>
          <AgentPicker
            agents={agents}
            matchedIds={matched}
            radiusKm={radiusKm}
            value={agentId}
            onChange={setAgentId}
            excludeId={me?.id}
            selfOption={
              canSelf && me?.id
                ? {
                    id: me.id,
                    label: hub
                      ? `🏭 ${t('agent.verify.carryMyself', 'Take it to the hub myself')}`
                      : `🛵 ${t('agent.verify.deliverMyself', 'Deliver it myself')}`,
                  }
                : undefined
            }
            ariaLabel={t('agent.assign.title', 'Assign agent')}
          />
          <button
            className="confirm-btn"
            style={{ marginTop: 14, borderRadius: 12, padding: 14, fontSize: 14 }}
            onClick={assign}
            disabled={busy || !agentId}
          >
            {busy ? '⏳…' : `✓ ${t('agent.assign.cta', 'Send job to agent')}`}
          </button>
        </>
      )}
    </Sheet>
  );
}
