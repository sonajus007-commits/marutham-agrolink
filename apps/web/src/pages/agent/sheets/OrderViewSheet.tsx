import { useEffect, useState } from 'react';
import { Sheet, Spinner, OrderPipeline, OrderTimeline } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { fmtMoney, resolveAddress, buildPipeline, deriveOrderCharges, itemLineTotal, type OrderDetail } from '@marutham/lib';

export function OrderViewSheet({ open, orderId, onClose }: { open: boolean; orderId: string | null; onClose: () => void }) {
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
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Failed to load order'));
    return () => {
      active = false;
    };
  }, [open, orderId]);

  const title = data?.order.code || 'Order';

  return (
    <Sheet open={open} title={title} onClose={onClose}>
      {error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)', fontSize: 13 }}>{error}</div>
      ) : !data ? (
        <Spinner />
      ) : (
        <OrderViewBody data={data} />
      )}
    </Sheet>
  );
}

function OrderViewBody({ data }: { data: OrderDetail }) {
  const { order: o, items, history, qr_svg } = data;
  const daText = resolveAddress(o.delivery_address);
  const charges = deriveOrderCharges(o);

  return (
    <>
      <div className="a-card" style={{ padding: '14px 10px' }}>
        <OrderPipeline nodes={buildPipeline(o.route, o.status)} />
      </div>

      {qr_svg ? (
        <div className="a-card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600, marginBottom: 8 }}>📷 Order QR — scan to advance</div>
          <div style={{ display: 'inline-block', background: '#fff', padding: 8, borderRadius: 12, lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: qr_svg }} />
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: 'var(--forest)', marginTop: 6 }}>
            {o.code || ''}
          </div>
        </div>
      ) : null}

      <div className="a-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, color: 'var(--forest)' }}>{o.consumer_name || 'Consumer'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, background: '#eef7ea', color: 'var(--forest)' }}>
            {o.status}
          </span>
        </div>
        {o.consumer_phone ? <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6 }}>📞 {o.consumer_phone}</div> : null}
        {daText ? <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>📍 {daText}</div> : null}
      </div>

      {o.agent_name ? (
        <div className="a-card">
          <div style={{ fontSize: 11, color: 'var(--gray)', fontWeight: 600 }}>🛵 Delivery Agent</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)', marginTop: 2 }}>
            {o.agent_name}{o.agent_vehicle ? ` · ${o.agent_vehicle}` : ''}
          </div>
        </div>
      ) : null}

      <div className="a-card">
        <h3>🌿 Items</h3>
        {items.map((it, i) => (
          <div className="irow" key={it.id || i}>
            <span>{it.name || 'Item'} × {it.qty}{it.unit ? ` ${it.unit}` : ''}</span>
            <span style={{ fontWeight: 600 }}>{fmtMoney(itemLineTotal(it))}</span>
          </div>
        ))}
        <div className="a-row"><span className="a-row__k">Item Total</span><span className="a-row__v">{fmtMoney(charges.itemTotal)}</span></div>
        {charges.handling > 0 ? (
          <div className="a-row"><span className="a-row__k">Handling charges</span><span className="a-row__v">{fmtMoney(charges.handling)}</span></div>
        ) : null}
        {charges.marketFee > 0 ? (
          <div className="a-row"><span className="a-row__k">Market fee (multiple farmers)</span><span className="a-row__v">{fmtMoney(charges.marketFee)}</span></div>
        ) : null}
        <div className="a-row"><span className="a-row__k">Delivery</span><span className="a-row__v">{charges.delivery > 0 ? fmtMoney(charges.delivery) : 'FREE'}</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 800, color: 'var(--forest)', marginTop: 6, borderTop: '1px solid #eef4ee', paddingTop: 6 }}>
          <span>Total</span><span>{fmtMoney(charges.total)}</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
          {o.pay_method || 'UPI'}{o.pay_status ? ` · ${o.pay_status}` : ''}
        </div>
      </div>

      {history.length ? (
        <div className="a-card">
          <h3>📍 Timeline</h3>
          <OrderTimeline entries={history} />
        </div>
      ) : null}
    </>
  );
}
