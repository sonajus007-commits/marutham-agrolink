import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner } from '@marutham/ui';
import { api, OfflineQueuedError } from '@marutham/api-client';
import {
  addressLabelKey,
  fmtMoney,
  fmtDate,
  payMethodKey,
  payStatusKey,
  resolveAddress,
  type OrderDetail,
  type AddressObject,
} from '@marutham/lib';
import { useToast } from '../../../components/Toast';
import { LiveOrderMap } from '../../../components/LiveOrderMap';
import { useOrderTrack } from '../../../lib/useOrderTrack';
import { getCurrentPosition } from '../../../native/geolocation';

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
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The agent's own live route to the door. This agent IS the order's assigned agent
  // and is GPS-pinging every 30 s while out delivering, so /track returns their own
  // moving position plus the destination — the very feed the consumer map consumes.
  // Poll only while the sheet is open; the map stays invisible without a Maps key or
  // coordinates, and the address + confirm button below carry the delivery regardless.
  const track = useOrderTrack(open ? orderId : null, open);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setData(null);
    setError(null);
    setBusy(false); // the sheet stays mounted between orders — a finished confirm
    // would otherwise leave the next order's button stuck on "Confirming…"
    api
      .getOrder(orderId)
      .then((res) => {
        if (!active) return;
        setData(res);
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
    if (!orderId || !data) return;
    const stage = data.order.stage;
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
      // Best-effort proof-of-delivery location. Never blocks the delivery: if the
      // agent declines permission or there is no fix, coords is null and we deliver
      // without it.
      const coords = (await getCurrentPosition()) ?? undefined;
      // A doorstep is exactly where signal dies, so this one is queueable. The stage
      // we loaded rides along: if the order moved on meanwhile, the server refuses
      // the replay rather than advancing it from somewhere else.
      await api.deliverOffline(orderId, stage, coords);
      toast(t('agent.deliver.done', 'Order delivered! 🎉'), 'ok');
      onChanged();
    } catch (e) {
      if (e instanceof OfflineQueuedError) {
        // Parked, not lost. We do NOT fake the status: the list keeps showing what
        // the server actually knows until the queue syncs.
        toast(
          t('agent.queued', 'No signal — saved on your device. It will sync automatically.'),
          'ok',
        );
        onChanged();
        return;
      }
      toast(e instanceof Error ? e.message : t('agent.deliver.failed', 'Failed to confirm'), 'er');
      setBusy(false);
    }
  }

  const o = data?.order;
  const isCod = o?.pay_method === 'Cash on Delivery';

  return (
    <Sheet
      open={open}
      title={o?.code || t('agent.deliver.title', 'Deliver Order')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
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
              <div className="cod-bar__label">
                {t('agent.deliver.collectCod', 'Collect Cash on Delivery')}
              </div>
              <div className="cod-bar__amt">{fmtMoney(o.total)}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 6 }}>
                {t('agent.deliver.collectFirst', 'Collect before handing over')}
              </div>
            </div>
          ) : null}

          <DeliveryAddress order={o} />

          {/* Live route from the agent's own position to the customer's door, with
              ETA — the same map the customer watches, shown here to navigate the last
              mile. Renders only when Maps is configured and there are coordinates. */}
          <LiveOrderMap track={track} />

          <div className="a-card">
            <h3>🌿 {t('agent.deliver.items', 'Items to Hand Over')}</h3>
            {data.items.map((it, i) => (
              <div className="irow" key={i}>
                <span>{it.name}</span>
                <span>
                  {it.qty} {it.unit}
                </span>
              </div>
            ))}
          </div>

          {o.eta_ts ? (
            <div className="a-card">
              <div style={{ fontSize: 11, color: 'var(--gray)' }}>
                {t('agent.deliver.eta', 'ETA:')} {fmtDate(o.eta_ts, i18n.language)}
              </div>
            </div>
          ) : null}

          <div className="a-card">
            <h3>💳 {t('consumer.order.payment', 'Payment')}</h3>
            <div className="irow">
              <span>{t('agent.deliver.method', 'Method')}</span>
              <span>{o.pay_method ? t(payMethodKey(o.pay_method), o.pay_method) : '—'}</span>
            </div>
            <div className="irow">
              <span>{t('consumer.home.col.status', 'Status')}</span>
              <span style={{ color: o.pay_status === 'paid' ? 'var(--green)' : 'var(--sun)' }}>
                {o.pay_status ? t(payStatusKey(o.pay_status), o.pay_status) : '—'}
              </span>
            </div>
            <div className="irow">
              <span>{t('consumer.order.total', 'Total')}</span>
              <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--forest)' }}>
                {fmtMoney(o.total)}
              </span>
            </div>
          </div>

          <button className="confirm-btn" onClick={confirm} disabled={busy}>
            {busy
              ? t('agent.deliver.busy', 'Confirming…')
              : isCod
                ? `✅ ${t('agent.deliver.ctaCod', 'Confirm Cash Collected & Delivered')}`
                : `✅ ${t('agent.deliver.cta', 'Confirm Delivered')}`}
          </button>
        </>
      )}
    </Sheet>
  );
}

function DeliveryAddress({ order }: { order: OrderDetail['order'] }) {
  const { t } = useTranslation();
  const da = order.delivery_address;
  const daText = resolveAddress(da);
  const label = da && typeof da === 'object' ? (da as AddressObject).label : undefined;
  const callPhone =
    (da && typeof da === 'object' ? (da as AddressObject).phone : undefined) ||
    order.consumer_phone;

  return (
    <div className="a-card">
      <h3>📍 {t('consumer.checkout.deliveryAddress', 'Delivery Address')}</h3>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 3 }}>
        {order.consumer_name || t('agent.consumer', 'Consumer')}
        {label ? ` · ${t(addressLabelKey(label), label)}` : ''}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--forest)' }}>{daText || '—'}</div>
      {callPhone ? (
        <a className="call-link" href={`tel:${callPhone}`}>
          📞 {t('agent.deliver.call', 'Call Customer')}
        </a>
      ) : null}
    </div>
  );
}
