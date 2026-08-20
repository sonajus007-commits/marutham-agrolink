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
  type OrderPart,
} from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { LiveOrderMap } from '../../components/LiveOrderMap';
import { TRACK_POLL_MS, useOrderTrack } from '../../lib/useOrderTrack';
import { CancelOrderModal } from './CancelOrderModal';
import { ReturnRequestModal } from './ReturnRequestModal';
import { useReorder } from './useReorder';

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
  const { order: o, history, qr_svg, parts } = data;
  /* A multi-vendor order: one basket, but each seller's goods travel as their own
   * parcel and can arrive on different days. Only present when the order actually
   * spans sellers. */
  const isSplit = !!parts && parts.length > 0;
  const toast = useToast();
  const reorder = useReorder();
  const [items, setItems] = useState<OrderItem[]>(data.items);
  const [showCancel, setShowCancel] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [downloading, setDownloading] = useState(false);
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

  async function downloadInvoice() {
    // Open the tab synchronously on the click so the pop-up blocker allows it,
    // then point it at the fetched invoice (Print → Save as PDF from there).
    const win = window.open('', '_blank');
    setDownloading(true);
    try {
      const blob = await api.getInvoiceHtml(o.id);
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        // Pop-up blocked — fall back to a direct download of the invoice page.
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoice-${o.code || 'order'}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      if (win) win.close();
      toast(
        e instanceof Error
          ? e.message
          : t('consumer.order.invoiceFailed', 'Could not open the invoice'),
        'er',
      );
    } finally {
      setDownloading(false);
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
        {/* A split order has no single journey to draw — each parcel has its own,
            shown per part below. Drawing one here would have to pick a route the
            order does not have and would report only the slowest parcel. */}
        {isSplit ? (
          <div style={{ fontSize: 12, color: 'var(--neutral-700)', lineHeight: 1.6 }}>
            {/* A split order always spans 2+ sellers, so there is no singular case. */}
            {t(
              'consumer.order.splitIntro',
              'This order comes from {{count}} sellers. Each seller’s items travel separately and may arrive at different times — track each part below.',
              { count: parts.length },
            )}
          </div>
        ) : (
          <OrderPipeline
            nodes={buildPipeline(o.route || 'direct', effectiveStatus)}
            labelFor={(l) => t(statusKey(l), l)}
          />
        )}
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
        {/* Live-tracking map for a single-parcel order. A split order has no one
            journey to draw here — each parcel travels on its own, so the map is
            shown per part below instead. The pipeline stepper above remains the
            fallback whenever the map isn't shown (no Maps key, or no coordinates). */}
        {isSplit ? null : <LiveOrderMap track={track} />}
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

      {isSplit ? (
        parts.map((part) => (
          <PartCard
            key={part.id}
            part={part}
            items={items.filter((it) => it.order_id === part.id)}
            onRated={(itemId, stars) =>
              setItems((prev) =>
                prev.map((it) =>
                  it.id === itemId ? { ...it, rated: true, rating_value: stars } : it,
                ),
              )
            }
            onChanged={onSilentRefresh}
          />
        ))
      ) : (
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
                  prev.map((it, i) =>
                    i === idx ? { ...it, rated: true, rating_value: stars } : it,
                  ),
                )
              }
            />
          ))}
        </div>
      )}

      <div className="ord-card">
        <h3>💰 {t('consumer.order.priceBreakdown', 'Price Breakdown')}</h3>
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.itemTotal', 'Item Total')}</span>
          <span className="ival">{fmtMoney(charges.itemTotal)}</span>
        </div>
        {/* Every charge keeps its row even at zero — see the note in CartTab. The
            receipt has to list the same lines the cart quoted, or a customer checking
            one against the other finds rows that came and went. */}
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.handling', 'Handling charges')}</span>
          <span className="ival">{fmtMoney(charges.handling)}</span>
        </div>
        <div className="irow">
          <span className="ilbl">{t('consumer.order.marketFee', 'Multiple Seller Fees')}</span>
          <span className="ival">{fmtMoney(charges.marketFee)}</span>
        </div>
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

      <Button
        variant="ghost"
        block
        onClick={downloadInvoice}
        disabled={downloading}
        style={{ marginBottom: 12 }}
      >
        {downloading
          ? t('consumer.order.invoicePreparing', 'Opening invoice…')
          : `🧾 ${t('consumer.order.downloadInvoice', 'View / Print Invoice')}`}
      </Button>

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

/**
 * One seller's parcel within a multi-vendor order.
 *
 * Everything here is scoped to the PART, not to the order as a whole: its own
 * journey, its own status, and its own rating gate — a customer whose vegetables
 * arrived today should be able to rate that seller without waiting on the parcel
 * that is still two days out. Rating calls the part's id because the server checks
 * the line against the order row it was asked about, and the lines live on the child.
 */
function PartCard({
  part,
  items,
  onRated,
  onChanged,
}: {
  part: OrderPart;
  items: OrderItem[];
  onRated: (itemId: string, stars: number) => void;
  /** A part was cancelled — the rest of the order carries on, so refresh in place. */
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [showCancel, setShowCancel] = useState(false);

  // Each parcel is its own order with its own agent and route, so it tracks itself:
  // poll this part's /track for the live agent dot and to keep its stepper honest as
  // the parcel advances, exactly as the top-level order does. A cancelled part has
  // nothing left to track.
  const partTrack = useOrderTrack(part.id, isOrderActive(part));
  const liveStatus = partTrack?.order.status;
  const partStatus = isOrderCancelled(part) ? 'Cancelled' : String(liveStatus ?? part.status ?? '');
  const partDelivered = partStatus === 'Delivered';

  return (
    <div className="ord-card">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 10,
        }}
      >
        <h3 style={{ margin: 0 }}>
          📦 {part.seller_name || t('consumer.order.partSeller', 'Seller')}
        </h3>
        <span className="ord-status-pill" style={{ background: statusColor(partStatus) }}>
          {t(statusKey(partStatus), partStatus)}
        </span>
      </div>

      <div
        style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: 'var(--gray)',
          marginBottom: 10,
        }}
      >
        {part.code}
        {part.village ? ` · ${part.village}` : ''}
      </div>

      {isOrderCancelled(part) ? null : (
        <div style={{ padding: '4px 0 10px' }}>
          <OrderPipeline
            nodes={buildPipeline(partTrack?.order.route || part.route || 'direct', partStatus)}
            labelFor={(l) => t(statusKey(l), l)}
          />
          {/* This parcel's own live map — its agent, its dispatch hub, the shared
              destination — shown only when Maps is configured and there is a route
              to draw; otherwise the stepper above stands alone. */}
          <LiveOrderMap track={partTrack} />
        </div>
      )}

      {items.map((item, idx) => (
        <ItemRow
          key={item.id || idx}
          item={item}
          orderId={part.id}
          canRate={partDelivered}
          onRated={(stars) => onRated(item.id || '', stars)}
        />
      ))}

      {/* A cancelled part keeps the figure it was cancelled at — that is what the
          refund was worked out from — but showing it here reads as money still
          owed. Worse, it can include the delivery fee, which moves to a part that
          is still coming, so the parts would appear to add up to more than the
          order's total. Say it is not charged instead. */}
      <div className="irow" style={{ marginTop: 8 }}>
        <span className="ilbl">{t('consumer.order.partTotal', 'Part total')}</span>
        <span className="ival">
          {isOrderCancelled(part) ? (
            <span style={{ color: 'var(--gray)', fontWeight: 600 }}>
              {t('consumer.order.partNotCharged', 'Not charged')}
            </span>
          ) : (
            fmtMoney(part.total)
          )}
        </span>
      </div>

      {canCancelOrder(part) ? (
        <button
          className="cons-btn-outline-danger"
          style={{ marginTop: 10 }}
          onClick={() => setShowCancel(true)}
        >
          {t('consumer.order.cancelPart', 'Cancel this part')}
        </button>
      ) : null}

      <CancelOrderModal
        order={part}
        sellerName={part.seller_name}
        open={showCancel}
        onClose={() => setShowCancel(false)}
        onCancelled={() => {
          setShowCancel(false);
          onChanged();
        }}
      />
    </div>
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
