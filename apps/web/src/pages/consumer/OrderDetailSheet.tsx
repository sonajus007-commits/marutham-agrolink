import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, OrderPipeline, OrderTimeline, Sheet, Spinner, StarRating } from '@marutham/ui';
import { api, type TrackResponse } from '@marutham/api-client';
import {
  addressLabelKey,
  buildPipeline,
  canCancelOrder,
  canRequestReturn,
  deriveOrderCharges,
  fmtDate,
  fmtMoney,
  getProductEmoji,
  isOrderActive,
  isOrderCancelled,
  itemLineTotal,
  payMethodKey,
  payStatusKey,
  resolveAddress,
  returnWindowHoursLeft,
  statusColor,
  statusKey,
  type OrderDetail,
  type OrderItem,
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
  const { t } = useTranslation();
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
      .catch(
        (e) =>
          active &&
          setError(
            e instanceof Error
              ? e.message
              : t('consumer.detail.loadFailed', 'Could not load order'),
          ),
      );

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
              ? {
                  ...prev,
                  order: { ...prev.order, status: tr.order.status, route: tr.order.route },
                }
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
    <Sheet
      open={open}
      title={order?.code || t('consumer.order.title', 'Order')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      {error ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      ) : !data ? (
        <Spinner />
      ) : (
        <OrderDetailBody
          data={data}
          track={track}
          onChanged={handleChanged}
          onSilentRefresh={onOrderChanged}
          onClose={onClose}
          onGoToCart={onGoToCart}
        />
      )}
    </Sheet>
  );
}

function OrderDetailBody({
  data,
  track,
  onChanged,
  onSilentRefresh,
  onClose,
  onGoToCart,
}: {
  data: OrderDetail;
  track: TrackResponse | null;
  onChanged: () => void;
  /** Refetch the parent list WITHOUT closing the sheet — used after confirming
   *  receipt, so the sheet stays open and rating unlocks in place. */
  onSilentRefresh: () => void;
  onClose: () => void;
  onGoToCart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { order: o, history, qr_svg } = data;
  const toast = useToast();
  const reorder = useReorder();
  const [items, setItems] = useState<OrderItem[]>(data.items);
  const [showCancel, setShowCancel] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  // Optimistic status after the customer confirms receipt: the prop order is not
  // mutated, but the pipeline, the status pill and the rating gate all read this.
  const [confirmedStatus, setConfirmedStatus] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => setItems(data.items), [data.items]);
  useEffect(() => setConfirmedStatus(null), [data.order.id]);

  const charges = deriveOrderCharges(o);
  const address = resolveAddress(o.delivery_address);
  const addressLabel =
    typeof o.delivery_address === 'object' ? o.delivery_address?.label : undefined;
  const effectiveStatus = confirmedStatus ?? String(o.status ?? '');
  const isDelivered = effectiveStatus === 'Delivered';
  // Confirm receipt is the ONE status action a customer owns: Out for Delivery →
  // Delivered. The server re-checks role, ownership and stage, so this is just UX.
  const canConfirm = !isOrderCancelled(o) && effectiveStatus === 'Out for Delivery';
  // The English value drives statusColor; only the spoken form is translated.
  const status = isOrderCancelled(o) ? 'Cancelled' : effectiveStatus;
  const hoursLeft = canRequestReturn(o) ? Math.ceil(returnWindowHoursLeft(o)) : 0;

  async function confirmReceived() {
    setConfirming(true);
    try {
      await api.confirmReceived(o.id);
      setConfirmedStatus('Delivered');
      toast(
        t('consumer.order.confirmedThanks', 'Delivery confirmed — you can now rate your items.'),
        'ok',
      );
      onSilentRefresh(); // update the list badge behind the still-open sheet
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : t('consumer.order.confirmFailed', 'Could not confirm delivery'),
        'er',
      );
    } finally {
      setConfirming(false);
    }
  }

  function handleReorder() {
    const { added, unavailable } = reorder(items);
    if (added === 0) {
      toast(t('consumer.order.reorderNone', 'None of these items are available today.'), 'er');
      return;
    }
    toast(
      unavailable.length
        ? t('consumer.order.reorderPartial', { count: added, missing: unavailable.length })
        : t('consumer.order.reorderAll', { count: added }),
      unavailable.length ? 'nfo' : 'ok',
    );
    onClose();
    onGoToCart();
  }

  return (
    <>
      <div className="ord-card" style={{ padding: '14px 10px' }}>
        <OrderPipeline
          nodes={buildPipeline(o.route || 'direct', effectiveStatus)}
          labelFor={(l) => t(statusKey(l), l)}
        />
        {track?.agent || track?.eta ? (
          <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
            {track.agent ? (
              <div className="track-box track-box--agent">
                <div className="track-box__k">
                  🛵 {t('consumer.order.agent', 'Your Delivery Agent')}
                </div>
                <div className="track-box__v">{track.agent.name}</div>
                {track.agent.vehicle ? (
                  <div className="track-box__sub">{track.agent.vehicle}</div>
                ) : null}
              </div>
            ) : null}
            {track.eta ? (
              <div className="track-box track-box--eta">
                <div className="track-box__k">⏱ {t('consumer.order.eta', 'Estimated Arrival')}</div>
                <div className="track-box__v">{fmtDate(track.eta, i18n.language)}</div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <span className="ord-status-pill" style={{ background: statusColor(status) }}>
          {t(statusKey(status), status)}
        </span>
        {canCancelOrder(o) ? (
          <button className="cons-btn-outline-danger" onClick={() => setShowCancel(true)}>
            {t('consumer.order.cancel', 'Cancel Order')}
          </button>
        ) : null}
      </div>

      {canConfirm ? (
        <Button
          variant="primary"
          block
          onClick={confirmReceived}
          disabled={confirming}
          style={{ marginBottom: 16 }}
        >
          {confirming
            ? t('consumer.order.confirming', 'Confirming…')
            : `✅ ${t('consumer.order.confirmReceived', 'Confirm Received')}`}
        </Button>
      ) : null}

      {qr_svg ? (
        <div className="ord-card" style={{ textAlign: 'center' }}>
          <h3>📷 {t('consumer.order.qr', 'Order QR')}</h3>
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
          <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>
            {t('consumer.order.qrHint', 'Show this to your delivery agent')}
          </div>
        </div>
      ) : null}

      <div className="ord-card">
        <h3>📋 {t('consumer.order.info', 'Order Info')}</h3>
        <div className="irow">
          <span className="ilbl">{t('consumer.order.code', 'Order Code')}</span>
          <span className="ival">{o.code || '—'}</span>
        </div>
        <div className="irow">
          <span className="ilbl">{t('consumer.order.placedOn', 'Placed On')}</span>
          <span className="ival">{fmtDate(o.created_at, i18n.language)}</span>
        </div>
        <div className="irow">
          <span className="ilbl">{t('consumer.order.payment', 'Payment')}</span>
          <span className="ival">
            {o.pay_method ? t(payMethodKey(o.pay_method), o.pay_method) : '—'}
            {' · '}
            <span style={{ color: o.pay_status === 'paid' ? 'var(--success)' : 'var(--sun)' }}>
              {o.pay_status ? t(payStatusKey(o.pay_status), o.pay_status) : ''}
            </span>
          </span>
        </div>
        {o.delivered_at ? (
          <div className="irow">
            <span className="ilbl">{t('status.delivered', 'Delivered')}</span>
            <span className="ival">{fmtDate(o.delivered_at, i18n.language)}</span>
          </div>
        ) : null}
      </div>

      <div className="ord-card">
        <h3>📍 {t('consumer.checkout.deliveryAddress', 'Delivery Address')}</h3>
        {addressLabel ? (
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--forest)', marginBottom: 3 }}>
            {t(addressLabelKey(addressLabel), addressLabel)}
          </div>
        ) : null}
        <div style={{ fontSize: 12, color: 'var(--neutral-700)', lineHeight: 1.55 }}>
          {address || '—'}
        </div>
      </div>

      <div className="ord-card">
        <h3>🌿 {t('consumer.order.items', 'Items')}</h3>
        {items.map((item, idx) => (
          <ItemRow
            key={item.id || idx}
            item={item}
            orderId={o.id}
            canRate={isDelivered}
            onRated={(stars) =>
              setItems((prev) =>
                prev.map((it, i) => (i === idx ? { ...it, rated: true, rating_value: stars } : it)),
              )
            }
          />
        ))}
      </div>

      <div className="ord-card">
        <h3>💰 {t('consumer.order.priceBreakdown', 'Price Breakdown')}</h3>
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.itemTotal', 'Item Total')}</span>
          <span className="ival">{fmtMoney(charges.itemTotal)}</span>
        </div>
        {charges.handling > 0 ? (
          <div className="irow">
            <span className="ilbl">{t('consumer.cart.handling', 'Handling charges')}</span>
            <span className="ival">{fmtMoney(charges.handling)}</span>
          </div>
        ) : null}
        {charges.marketFee > 0 ? (
          <div className="irow">
            <span className="ilbl">
              {t('consumer.order.marketFee', 'Market fee')}{' '}
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>
                ({t('consumer.order.multipleFarmers', 'multiple farmers')})
              </span>
            </span>
            <span className="ival">{fmtMoney(charges.marketFee)}</span>
          </div>
        ) : null}
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.delivery', 'Delivery')}</span>
          <span className="ival">
            {charges.delivery > 0 ? (
              fmtMoney(charges.delivery)
            ) : (
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                {t('consumer.cart.free', 'FREE')}
              </span>
            )}
          </span>
        </div>
        <div className="irow">
          <span className="ilbl" style={{ fontWeight: 700 }}>
            {t('consumer.order.total', 'Total')}
          </span>
          <span className="ival" style={{ fontSize: 15 }}>
            {fmtMoney(charges.total)}
          </span>
        </div>
        {charges.saved > 0 ? (
          <div className="irow">
            <span className="ilbl" style={{ color: 'var(--leaf)' }}>
              💚 {t('consumer.order.youSaved', 'You Saved')}
            </span>
            <span className="ival" style={{ color: 'var(--leaf)' }}>
              {fmtMoney(charges.saved)}
            </span>
          </div>
        ) : null}
      </div>

      {isDelivered ? (
        <Button variant="ghost" block onClick={handleReorder} style={{ marginBottom: 12 }}>
          🔄 {t('consumer.order.reorder', 'Reorder All Items')}
        </Button>
      ) : null}

      {o.return_id ? (
        <div
          className="ord-card"
          style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning-bg)' }}
        >
          <h3 style={{ color: 'var(--warning-fg)' }}>
            ↩ {t('consumer.order.returnRequested', 'Return Requested')}
          </h3>
          <div className="irow">
            <span className="ilbl">{t('consumer.order.returnCode', 'Return Code')}</span>
            <span className="ival">{o.return_code || '—'}</span>
          </div>
          <div className="irow">
            <span className="ilbl">{t('consumer.home.col.status', 'Status')}</span>
            <span className="ival">
              {t(payStatusKey(o.return_status || 'pending'), o.return_status || 'pending')}
            </span>
          </div>
        </div>
      ) : canRequestReturn(o) ? (
        <button
          className="cons-btn-outline-danger cons-btn-outline-danger--block"
          onClick={() => setShowReturn(true)}
        >
          ↩ {t('consumer.return.title', 'Request return / refund')}
          <span style={{ display: 'block', fontWeight: 400, fontSize: 10, marginTop: 2 }}>
            {t('consumer.order.returnWindow', '{{hours}}h left in the return window', {
              hours: hoursLeft,
            })}
          </span>
        </button>
      ) : null}

      {history.length ? (
        <div className="ord-card">
          <h3>📍 {t('consumer.order.timeline', 'Status Timeline')}</h3>
          <OrderTimeline
            entries={history}
            labelFor={(l) => t(statusKey(l), l)}
            lang={i18n.language}
          />
        </div>
      ) : null}

      <CancelOrderModal
        order={o}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onCancelled={onChanged}
      />
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
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Show the click immediately; roll back if the server rejects it.
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  async function rate(stars: number) {
    if (!item.id || busy) return;
    setOptimistic(stars);
    setBusy(true);
    try {
      await api.rateItem(orderId, item.id, stars);
      toast(t('consumer.order.rateThanks', 'Thanks for your rating!'), 'ok');
      onRated(stars);
    } catch (e) {
      if (mounted.current) setOptimistic(null);
      toast(
        e instanceof Error ? e.message : t('consumer.order.rateFailed', 'Could not save rating'),
        'er',
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid var(--surface-muted)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
          {getProductEmoji(item.name)} {item.name}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{fmtMoney(itemLineTotal(item))}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>
        {item.qty} {item.unit} × {fmtMoney(item.price)}
        {item.farmer_name
          ? ` · ${t('consumer.cart.fromSeller', 'from {{name}}', { name: item.farmer_name })}`
          : ''}
      </div>
      {canRate ? (
        <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
          {item.rated ? (
            <>
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>
                {t('consumer.order.rated', 'Rated:')}
              </span>
              <StarRating
                value={item.rating_value || 0}
                labels={{
                  rated: (v) =>
                    t('consumer.order.ratedAria', 'Rated {{value}} out of 5', { value: v }),
                }}
              />
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>
                {t('consumer.order.rate', 'Rate:')}
              </span>
              <StarRating
                value={optimistic || 0}
                onRate={rate}
                disabled={busy}
                label={item.name}
                labels={{
                  rate: (name) => t('consumer.order.rateAria', 'Rate {{name}}', { name }),
                  star: (n) => t('consumer.order.starAria', { count: n }),
                }}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
