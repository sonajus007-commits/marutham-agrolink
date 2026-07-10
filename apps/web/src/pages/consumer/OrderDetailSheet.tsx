import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, OrderPipeline, OrderTimeline, Sheet, Spinner, StarRating } from '@marutham/ui';
import { api, type TrackResponse } from '@marutham/api-client';
import {
  buildPipeline, canCancelOrder, canRequestReturn, deriveOrderCharges, fmtDate, fmtMoney,
  getProductEmoji, isOrderActive, isOrderCancelled, itemLineTotal, resolveAddress,
  returnWindowHoursLeft, statusColor, type OrderDetail, type OrderItem,
} from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { CancelOrderModal } from './CancelOrderModal';
import { ReturnRequestModal } from './ReturnRequestModal';
import { useReorder } from './useReorder';

/** How often an in-flight order re-checks its agent/ETA. */
const TRACK_POLL_MS = 30_000;

export function OrderDetailSheet({
  orderId,
  open,
  onClose,
  onOrderChanged,
  onGoToCart,
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  /** Cancel or return succeeded — the parent should refetch its order list. */
  onOrderChanged: () => void;
  onGoToCart: () => void;
}) {
  const [data, setData] = useState<OrderDetail | null>(null);
  const [track, setTrack] = useState<TrackResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !orderId) return;
    let active = true;
    setData(null);
    setTrack(null);
    setError(null);

    // Tracking is best-effort: a missing/failed track must not hide the order.
    Promise.all([api.getOrder(orderId), api.trackOrder(orderId).catch(() => null)])
      .then(([detail, tr]) => {
        if (!active) return;
        setData(detail);
        setTrack(tr);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load order'));

    return () => {
      active = false;
    };
  }, [open, orderId]);

  const order = data?.order ?? null;
  const isLive = !!order && isOrderActive(order);

  // Poll only the cheap /track endpoint, and only while an in-flight order is
  // on screen. The legacy page re-rendered the entire sheet every 30s.
  useEffect(() => {
    if (!open || !orderId || !isLive) return;
    const id = setInterval(() => {
      api
        .trackOrder(orderId)
        .then((tr) => {
          setTrack(tr);
          // Status may have advanced since the sheet opened — keep the pipeline honest.
          setData((prev) =>
            prev && prev.order.status !== tr.order.status
              ? { ...prev, order: { ...prev.order, status: tr.order.status, route: tr.order.route } }
              : prev,
          );
        })
        .catch(() => {
          /* transient — the next tick retries */
        });
    }, TRACK_POLL_MS);
    return () => clearInterval(id);
  }, [open, orderId, isLive]);

  const handleChanged = useCallback(() => {
    onOrderChanged();
    onClose();
  }, [onOrderChanged, onClose]);

  return (
    <Sheet open={open} title={order?.code || 'Order'} onClose={onClose}>
      {error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)', fontSize: 13 }}>{error}</div>
      ) : !data ? (
        <Spinner />
      ) : (
        <OrderDetailBody data={data} track={track} onChanged={handleChanged} onClose={onClose} onGoToCart={onGoToCart} />
      )}
    </Sheet>
  );
}

function OrderDetailBody({
  data,
  track,
  onChanged,
  onClose,
  onGoToCart,
}: {
  data: OrderDetail;
  track: TrackResponse | null;
  onChanged: () => void;
  onClose: () => void;
  onGoToCart: () => void;
}) {
  const { order: o, history, qr_svg } = data;
  const toast = useToast();
  const reorder = useReorder();
  const [items, setItems] = useState<OrderItem[]>(data.items);
  const [showCancel, setShowCancel] = useState(false);
  const [showReturn, setShowReturn] = useState(false);

  useEffect(() => setItems(data.items), [data.items]);

  const charges = deriveOrderCharges(o);
  const address = resolveAddress(o.delivery_address);
  const addressLabel = typeof o.delivery_address === 'object' ? o.delivery_address?.label : undefined;
  const isDelivered = o.status === 'Delivered';
  const statusLabel = isOrderCancelled(o) ? 'Cancelled' : o.status;
  const hoursLeft = canRequestReturn(o) ? Math.ceil(returnWindowHoursLeft(o)) : 0;

  function handleReorder() {
    const { added, unavailable } = reorder(items);
    if (added === 0) {
      toast('None of these items are available today.', 'er');
      return;
    }
    toast(
      unavailable.length
        ? `${added} item${added === 1 ? '' : 's'} added — ${unavailable.length} unavailable today`
        : `${added} item${added === 1 ? '' : 's'} added to cart.`,
      unavailable.length ? 'nfo' : 'ok',
    );
    onClose();
    onGoToCart();
  }

  return (
    <>
      <div className="ord-card" style={{ padding: '14px 10px' }}>
        <OrderPipeline nodes={buildPipeline(o.route || 'direct', o.status)} />
        {track?.agent || track?.eta ? (
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {track.agent ? (
              <div className="track-box track-box--agent">
                <div className="track-box__k">🛵 Your Delivery Agent</div>
                <div className="track-box__v">{track.agent.name}</div>
                {track.agent.vehicle ? <div className="track-box__sub">{track.agent.vehicle}</div> : null}
              </div>
            ) : null}
            {track.eta ? (
              <div className="track-box track-box--eta">
                <div className="track-box__k">⏱ Estimated Arrival</div>
                <div className="track-box__v">{fmtDate(track.eta)}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <span className="ord-status-pill" style={{ background: statusColor(statusLabel) }}>
          {statusLabel}
        </span>
        {canCancelOrder(o) ? (
          <button className="cons-btn-outline-danger" onClick={() => setShowCancel(true)}>Cancel Order</button>
        ) : null}
      </div>

      {qr_svg ? (
        <div className="ord-card" style={{ textAlign: 'center' }}>
          <h3>📷 Order QR</h3>
          <div
            style={{ display: 'inline-block', background: 'var(--surface)', padding: 8, borderRadius: 12, lineHeight: 0 }}
            dangerouslySetInnerHTML={{ __html: qr_svg }}
          />
          <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: 'var(--forest)', marginTop: 6 }}>
            {o.code || ''}
          </div>
          <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>Show this to your delivery agent</div>
        </div>
      ) : null}

      <div className="ord-card">
        <h3>📋 Order Info</h3>
        <div className="irow"><span className="ilbl">Order Code</span><span className="ival">{o.code || '—'}</span></div>
        <div className="irow"><span className="ilbl">Placed On</span><span className="ival">{fmtDate(o.created_at)}</span></div>
        <div className="irow">
          <span className="ilbl">Payment</span>
          <span className="ival">
            {o.pay_method}{' · '}
            <span style={{ color: o.pay_status === 'paid' ? 'var(--success)' : 'var(--sun)' }}>{o.pay_status}</span>
          </span>
        </div>
        {o.delivered_at ? (
          <div className="irow"><span className="ilbl">Delivered</span><span className="ival">{fmtDate(o.delivered_at)}</span></div>
        ) : null}
      </div>

      <div className="ord-card">
        <h3>📍 Delivery Address</h3>
        {addressLabel ? (
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--forest)', marginBottom: 3 }}>{addressLabel}</div>
        ) : null}
        <div style={{ fontSize: 12, color: 'var(--neutral-700)', lineHeight: 1.55 }}>{address || '—'}</div>
      </div>

      <div className="ord-card">
        <h3>🌿 Items</h3>
        {items.map((item, idx) => (
          <ItemRow
            key={item.id || idx}
            item={item}
            orderId={o.id}
            canRate={isDelivered}
            onRated={(stars) =>
              setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, rated: true, rating_value: stars } : it)))
            }
          />
        ))}
      </div>

      <div className="ord-card">
        <h3>💰 Price Breakdown</h3>
        <div className="irow"><span className="ilbl">Item Total</span><span className="ival">{fmtMoney(charges.itemTotal)}</span></div>
        {charges.handling > 0 ? (
          <div className="irow"><span className="ilbl">Handling charges</span><span className="ival">{fmtMoney(charges.handling)}</span></div>
        ) : null}
        {charges.marketFee > 0 ? (
          <div className="irow">
            <span className="ilbl">Market fee <span style={{ fontSize: 10, color: 'var(--gray)' }}>(multiple farmers)</span></span>
            <span className="ival">{fmtMoney(charges.marketFee)}</span>
          </div>
        ) : null}
        <div className="irow">
          <span className="ilbl">Delivery</span>
          <span className="ival">
            {charges.delivery > 0 ? fmtMoney(charges.delivery) : <span style={{ color: 'var(--success)', fontWeight: 700 }}>FREE</span>}
          </span>
        </div>
        <div className="irow">
          <span className="ilbl" style={{ fontWeight: 700 }}>Total</span>
          <span className="ival" style={{ fontSize: 15 }}>{fmtMoney(charges.total)}</span>
        </div>
        {charges.saved > 0 ? (
          <div className="irow">
            <span className="ilbl" style={{ color: 'var(--leaf)' }}>💚 You Saved</span>
            <span className="ival" style={{ color: 'var(--leaf)' }}>{fmtMoney(charges.saved)}</span>
          </div>
        ) : null}
      </div>

      {isDelivered ? (
        <Button variant="ghost" block onClick={handleReorder} style={{ marginBottom: 12 }}>
          🔄 Reorder All Items
        </Button>
      ) : null}

      {o.return_id ? (
        <div className="ord-card" style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-bg)' }}>
          <h3 style={{ color: 'var(--warning-fg)' }}>↩ Return Requested</h3>
          <div className="irow"><span className="ilbl">Return Code</span><span className="ival">{o.return_code || '—'}</span></div>
          <div className="irow"><span className="ilbl">Status</span><span className="ival">{o.return_status || 'pending'}</span></div>
        </div>
      ) : canRequestReturn(o) ? (
        <button className="cons-btn-outline-danger cons-btn-outline-danger--block" onClick={() => setShowReturn(true)}>
          ↩ Request Return / Refund
          <span style={{ display: 'block', fontWeight: 400, fontSize: 10, marginTop: 2 }}>
            {hoursLeft}h left in the return window
          </span>
        </button>
      ) : null}

      {history.length ? (
        <div className="ord-card">
          <h3>📍 Status Timeline</h3>
          <OrderTimeline entries={history} />
        </div>
      ) : null}

      <CancelOrderModal order={o} open={showCancel} onClose={() => setShowCancel(false)} onCancelled={onChanged} />
      <ReturnRequestModal
        order={o}
        items={items}
        open={showReturn}
        onClose={() => setShowReturn(false)}
        onSubmitted={onChanged}
      />
    </>
  );
}

function ItemRow({
  item,
  orderId,
  canRate,
  onRated,
}: {
  item: OrderItem;
  orderId: string;
  canRate: boolean;
  onRated: (stars: number) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Show the click immediately; roll back if the server rejects it.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  async function rate(stars: number) {
    if (!item.id || busy) return;
    setOptimistic(stars);
    setBusy(true);
    try {
      await api.rateItem(orderId, item.id, stars);
      toast('Thanks for your rating!', 'ok');
      onRated(stars);
    } catch (e) {
      if (mounted.current) setOptimistic(null);
      toast(e instanceof Error ? e.message : 'Could not save rating', 'er');
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-muted)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
          {getProductEmoji(item.name)} {item.name}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(itemLineTotal(item))}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>
        {item.qty} {item.unit} × {fmtMoney(item.price)}
        {item.farmer_name ? ` · from ${item.farmer_name}` : ''}
      </div>
      {canRate ? (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          {item.rated ? (
            <>
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>Rated:</span>
              <StarRating value={item.rating_value || 0} />
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>Rate:</span>
              <StarRating value={optimistic || 0} onRate={rate} disabled={busy} label={item.name} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
