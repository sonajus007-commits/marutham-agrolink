import { useEffect, useState } from 'react';
import { Sheet, Spinner } from '@marutham/ui';
import { api, type EligibleAgent } from '@marutham/api-client';
import type { Order } from '@marutham/lib';
import { useToast } from '../../../components/Toast';

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
    Promise.all([api.getOrder(orderId), api.getEligibleAgents(orderId, 'collection')])
      .then(([ord, elig]) => {
        if (!active) return;
        setOrder(ord.order);
        setMatched(elig.matched || []);
        setAll(elig.all || []);
        if ((elig.matched || []).length >= 1) setAgentId(elig.matched[0].id);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load order'));
    return () => {
      active = false;
    };
  }, [open, orderId]);

  async function confirm() {
    if (!orderId) return;
    setBusy(true);
    try {
      const res = await api.verifyOrder(orderId, { route, agent_id: agentId || undefined });
      toast(res.message || 'Order verified.', 'ok');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Verify failed', 'er');
      setBusy(false);
    }
  }

  const others = all.filter((a) => !matched.some((m) => m.id === a.id));

  return (
    <Sheet open={open} title={order?.code || 'Verify Order'} onClose={onClose}>
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
              {order.consumer_name || 'Consumer'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
              Fulfilment village: <b>{order.village || '—'}</b>
            </div>
          </div>

          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 8 }}>
            Delivery route
          </div>
          <div className="route-toggle" style={{ marginBottom: 14 }}>
            <button
              className={`route-btn ${route === 'direct' ? 'on' : ''}`}
              onClick={() => setRoute('direct')}
            >
              🛵 Direct Delivery
              <br />
              <span style={{ fontSize: 9, fontWeight: 400 }}>to consumer</span>
            </button>
            <button
              className={`route-btn ${route === 'hub' ? 'on' : ''}`}
              onClick={() => setRoute('hub')}
            >
              🏭 Transit to Hub
              <br />
              <span style={{ fontSize: 9, fontWeight: 400 }}>via hub</span>
            </button>
          </div>

          <div
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', margin: '6px 0 8px' }}
          >
            Collection agent
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
              ✓ {matched.length} agent{matched.length > 1 ? 's' : ''} cover this village —
              auto-selected.
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
              No agent is tagged to this village. Pick one manually.
            </div>
          )}
          <select
            className="a-select"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            aria-label="Collection agent"
          >
            <option value="">— Assign later —</option>
            {matched.length ? (
              <optgroup label="Covers this village">
                {matched.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.vehicle ? ` · ${a.vehicle}` : ''}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {others.length ? (
              <optgroup label="Other agents in district">
                {others.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.vehicle ? ` · ${a.vehicle}` : ''}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>

          <button
            className="confirm-btn"
            style={{ borderRadius: 12, padding: 14, fontSize: 14 }}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? '⏳ Verifying…' : '✓ Verify & Assign'}
          </button>
        </>
      )}
    </Sheet>
  );
}
