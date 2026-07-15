import { useEffect, useState } from 'react';
import { Sheet, Spinner } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  fmtMoney,
  fmtDate,
  resolveAddress,
  type OrderDetail,
  type AddressObject,
} from '@marutham/lib';
import { useToast } from '../../../components/Toast';

export function DeliverSheet({
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
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState('direct');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setData(null);
    setError(null);
    api
      .getOrder(orderId)
      .then((res) => {
        if (!active) return;
        setData(res);
        setRoute(res.order.route || 'direct');
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load order'));
    return () => {
      active = false;
    };
  }, [open, orderId]);

  async function changeRoute(next: string) {
    if (!orderId) return;
    setRoute(next);
    try {
      await api.setRoute(orderId, next);
      toast(`Route set to ${next}`, 'ok');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to set route', 'er');
    }
  }

  async function confirm() {
    if (!orderId) return;
    setBusy(true);
    try {
      await api.scanOrder(orderId);
      toast('Order delivered! 🎉', 'ok');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to confirm', 'er');
      setBusy(false);
    }
  }

  const o = data?.order;
  const isCod = o?.pay_method === 'Cash on Delivery';

  return (
    <Sheet open={open} title={o?.code || 'Deliver Order'} onClose={onClose}>
      {error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      ) : !data || !o ? (
        <Spinner />
      ) : (
        <>
          {isCod ? (
            <div className="cod-bar">
              <div className="cod-bar__label">Collect Cash on Delivery</div>
              <div className="cod-bar__amt">{fmtMoney(o.total)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 6 }}>
                Collect before handing over
              </div>
            </div>
          ) : null}

          <DeliveryAddress order={o} />

          <div className="a-card">
            <h3>🌿 Items to Hand Over</h3>
            {data.items.map((it, i) => (
              <div className="irow" key={i}>
                <span>{it.name}</span>
                <span>
                  {it.qty} {it.unit}
                </span>
              </div>
            ))}
          </div>

          <div className="a-card">
            <h3>🗺 Route</h3>
            <div className="route-toggle">
              <button
                className={`route-btn ${route === 'direct' ? 'on' : ''}`}
                onClick={() => changeRoute('direct')}
              >
                🛵 Direct
                <br />
                <span style={{ fontSize: 9, fontWeight: 400 }}>~2 hrs ETA</span>
              </button>
              <button
                className={`route-btn ${route === 'hub' ? 'on' : ''}`}
                onClick={() => changeRoute('hub')}
              >
                🏭 Via Hub
                <br />
                <span style={{ fontSize: 9, fontWeight: 400 }}>~4 hrs ETA</span>
              </button>
            </div>
            {o.eta_ts ? (
              <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 8 }}>
                ETA: {fmtDate(o.eta_ts)}
              </div>
            ) : null}
          </div>

          <div className="a-card">
            <h3>💳 Payment</h3>
            <div className="irow">
              <span>Method</span>
              <span>{o.pay_method || '—'}</span>
            </div>
            <div className="irow">
              <span>Status</span>
              <span style={{ color: o.pay_status === 'paid' ? 'var(--green)' : 'var(--sun)' }}>
                {o.pay_status || '—'}
              </span>
            </div>
            <div className="irow">
              <span>Total</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--forest)' }}>
                {fmtMoney(o.total)}
              </span>
            </div>
          </div>

          <button className="confirm-btn" onClick={confirm} disabled={busy}>
            {busy
              ? 'Confirming…'
              : isCod
                ? '✅ Confirm Cash Collected & Delivered'
                : '✅ Confirm Delivered'}
          </button>
        </>
      )}
    </Sheet>
  );
}

function DeliveryAddress({ order }: { order: OrderDetail['order'] }) {
  const da = order.delivery_address;
  const daText = resolveAddress(da);
  const label = da && typeof da === 'object' ? (da as AddressObject).label : undefined;
  const callPhone =
    (da && typeof da === 'object' ? (da as AddressObject).phone : undefined) ||
    order.consumer_phone;

  return (
    <div className="a-card">
      <h3>📍 Delivery Address</h3>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 3 }}>
        {order.consumer_name || 'Consumer'}
        {label ? ` · ${label}` : ''}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--forest)' }}>{daText || '—'}</div>
      {callPhone ? (
        <a className="call-link" href={`tel:${callPhone}`}>
          📞 Call Customer
        </a>
      ) : null}
    </div>
  );
}
