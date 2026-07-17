import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner, OrderPipeline, OrderTimeline } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  fmtMoney,
  payMethodKey,
  payStatusKey,
  resolveAddress,
  buildPipeline,
  deriveOrderCharges,
  itemLineTotal,
  statusKey,
  type OrderDetail,
} from '@marutham/lib';
import { useToast } from '../../../components/Toast';
import { useAuth } from '../../../auth/AuthContext';

export function OrderViewSheet({
  open,
  orderId,
  onClose,
}: {
  open: boolean;
  orderId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setData(null);
    setError(null);
    api
      .getOrder(orderId)
      .then((res) => active && setData(res))
      .catch(
        (e) =>
          active &&
          setError(e instanceof Error ? e.message : t('agent.err.order', 'Failed to load order')),
      );
    return () => {
      active = false;
    };
  }, [open, orderId]);

  const title = data?.order.code || t('consumer.order.title', 'Order');

  return (
    <Sheet open={open} title={title} onClose={onClose} backLabel={t('common.back', 'Back')}>
      {error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      ) : !data ? (
        <Spinner />
      ) : (
        <OrderViewBody data={data} />
      )}
    </Sheet>
  );
}

function OrderViewBody({ data }: { data: OrderDetail }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const { order: o, items, history, qr_svg } = data;
  const daText = resolveAddress(o.delivery_address);
  const charges = deriveOrderCharges(o);

  // The delivery agent decides direct-vs-hub around pickup. The server (PATCH
  // /route) allows the change only until the order is Out for Delivery, so it is
  // offered at the two pickup-side stages. Optimistic: `route` drives the pipeline.
  const [route, setRoute] = useState(o.route || 'direct');
  const [routing, setRouting] = useState(false);
  const isDeliveryAgent = user?.admin_role === 'Delivery Agent';
  const canRoute = isDeliveryAgent && (o.status === 'VCO Verified' || o.status === 'Picked Up');

  async function chooseRoute(next: string) {
    if (next === route || routing) return;
    const prev = route;
    setRoute(next); // optimistic — the pipeline reflects it immediately
    setRouting(true);
    try {
      await api.setRoute(o.id, next);
      toast(
        t('agent.deliver.routeSet', 'Route set to {{route}}', {
          route:
            next === 'hub'
              ? t('agent.route.hub', 'Transit to Hub')
              : t('agent.route.direct', 'Direct Delivery'),
        }),
        'ok',
      );
    } catch (e) {
      setRoute(prev); // roll back on failure
      toast(
        e instanceof Error ? e.message : t('agent.deliver.routeFailed', 'Failed to set route'),
        'er',
      );
    } finally {
      setRouting(false);
    }
  }

  return (
    <>
      <div className="a-card" style={{ padding: '14px 10px' }}>
        {/* Labels are translated HERE — OrderPipeline keys its ✓ off the raw label. */}
        <OrderPipeline
          nodes={buildPipeline(route, o.status)}
          labelFor={(l) => t(statusKey(l), l)}
        />
      </div>

      {canRoute ? (
        <div className="a-card">
          <h3>🗺 {t('agent.pickup.routeTitle', 'Send to Hub or Direct?')}</h3>
          <div className="route-toggle">
            <button
              className={`route-btn ${route === 'direct' ? 'on' : ''}`}
              onClick={() => chooseRoute('direct')}
              disabled={routing}
            >
              🛵 {t('agent.route.directShort', 'Direct')}
              <br />
              <span style={{ fontSize: 9, fontWeight: 400 }}>
                {t('agent.route.directEta', '~2 hrs ETA')}
              </span>
            </button>
            <button
              className={`route-btn ${route === 'hub' ? 'on' : ''}`}
              onClick={() => chooseRoute('hub')}
              disabled={routing}
            >
              🏭 {t('agent.route.hubShort', 'Via Hub')}
              <br />
              <span style={{ fontSize: 9, fontWeight: 400 }}>
                {t('agent.route.hubEta', '~4 hrs ETA')}
              </span>
            </button>
          </div>
          <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 8 }}>
            {t(
              'agent.pickup.routeHint',
              'Via Hub routes this parcel through the hub for the last mile.',
            )}
          </div>
        </div>
      ) : null}

      {qr_svg ? (
        <div className="a-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600, marginBottom: 8 }}>
            📷 {t('agent.view.qr', 'Order QR — scan to advance')}
          </div>
          <div
            style={{
              display: 'inline-block',
              background: 'var(--surface)',
              padding: 8,
              borderRadius: 12,
              lineHeight: 0,
            }}
            dangerouslySetInnerHTML={{ __html: qr_svg }}
          />
          <div
            style={{
              fontFamily: 'monospace',
              fontSize: 13,
              fontWeight: 800,
              color: 'var(--forest)',
              marginTop: 6,
            }}
          >
            {o.code || ''}
          </div>
        </div>
      ) : null}

      <div className="a-card">
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
        >
          <span style={{ fontWeight: 800, color: 'var(--forest)' }}>
            {o.consumer_name || t('agent.consumer', 'Consumer')}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 20,
              background: 'var(--success-bg)',
              color: 'var(--forest)',
            }}
          >
            {t(statusKey(String(o.status ?? '')), String(o.status ?? ''))}
          </span>
        </div>
        {o.consumer_phone ? (
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>
            📞 {o.consumer_phone}
          </div>
        ) : null}
        {daText ? (
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>📍 {daText}</div>
        ) : null}
      </div>

      {o.agent_name ? (
        <div className="a-card">
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600 }}>
            🛵 {t('consumer.order.agent', 'Your Delivery Agent')}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginTop: 2 }}>
            {o.agent_name}
            {o.agent_vehicle ? ` · ${o.agent_vehicle}` : ''}
          </div>
        </div>
      ) : null}

      <div className="a-card">
        <h3>🌿 {t('consumer.order.items', 'Items')}</h3>
        {items.map((it, i) => (
          <div className="irow" key={it.id || i}>
            <span>
              {it.name || t('agent.view.item', 'Item')} × {it.qty}
              {it.unit ? ` ${it.unit}` : ''}
            </span>
            <span style={{ fontWeight: 600 }}>{fmtMoney(itemLineTotal(it))}</span>
          </div>
        ))}
        <div className="a-row">
          <span className="a-row__k">{t('consumer.cart.itemTotal', 'Item Total')}</span>
          <span className="a-row__v">{fmtMoney(charges.itemTotal)}</span>
        </div>
        {charges.handling > 0 ? (
          <div className="a-row">
            <span className="a-row__k">{t('consumer.cart.handling', 'Handling charges')}</span>
            <span className="a-row__v">{fmtMoney(charges.handling)}</span>
          </div>
        ) : null}
        {charges.marketFee > 0 ? (
          <div className="a-row">
            <span className="a-row__k">
              {t('consumer.cart.marketFee', 'Market fee (multiple farmers)')}
            </span>
            <span className="a-row__v">{fmtMoney(charges.marketFee)}</span>
          </div>
        ) : null}
        <div className="a-row">
          <span className="a-row__k">{t('consumer.cart.delivery', 'Delivery')}</span>
          <span className="a-row__v">
            {charges.delivery > 0 ? fmtMoney(charges.delivery) : t('consumer.cart.free', 'FREE')}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--forest)',
            marginTop: 6,
            borderTop: '1px solid var(--surface-muted)',
            paddingTop: 6,
          }}
        >
          <span>{t('consumer.order.total', 'Total')}</span>
          <span>{fmtMoney(charges.total)}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
          {o.pay_method ? t(payMethodKey(o.pay_method), o.pay_method) : t('pay.upi', 'UPI')}
          {o.pay_status ? ` · ${t(payStatusKey(o.pay_status), o.pay_status)}` : ''}
        </div>
      </div>

      {history.length ? (
        <div className="a-card">
          <h3>📍 {t('consumer.order.timeline', 'Status Timeline')}</h3>
          <OrderTimeline
            entries={history}
            labelFor={(l) => t(statusKey(l), l)}
            lang={i18n.language}
          />
        </div>
      ) : null}
    </>
  );
}
