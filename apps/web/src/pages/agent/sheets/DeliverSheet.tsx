import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, Spinner, ActionBar } from '@marutham/ui';
import {
  api,
  OfflineQueuedError,
  DELIVERY_FAILURE_REASONS,
  type DeliveryFailureReason,
} from '@marutham/api-client';
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
import { PhotoCapture } from '../../../components/PhotoCapture';
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
  // The optional delivery OTP the customer reads out. Blank is fine — the delivery
  // still goes through (recorded unverified); only a wrong code is refused server-side.
  const [otp, setOtp] = useState('');
  // Optional proof-of-delivery photo (migration 060). Never blocks the delivery.
  const [proofPhoto, setProofPhoto] = useState<string | null>(null);
  // The "couldn't deliver" branch — a reason picker that records a failed attempt
  // without advancing the order. Closed by default; opening it reveals the reasons.
  const [failing, setFailing] = useState(false);
  const [failReason, setFailReason] = useState<DeliveryFailureReason | ''>('');
  const [failNote, setFailNote] = useState('');
  const [failBusy, setFailBusy] = useState(false);
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
    setOtp(''); // do not carry one order's code onto the next
    setProofPhoto(null); // nor one order's photo onto the next
    setBusy(false); // the sheet stays mounted between orders — a finished confirm
    // would otherwise leave the next order's button stuck on "Confirming…"
    setFailing(false); // collapse the reason picker for the next order
    setFailReason('');
    setFailNote('');
    setFailBusy(false);
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
      await api.deliverOffline(
        orderId,
        stage,
        coords,
        otp.trim() || undefined,
        proofPhoto || undefined,
      );
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

  // Record an attempt that could not be completed at the door. Like deliver, this is
  // offline-queueable and asserts the stage it saw, so a late replay is refused rather
  // than stamped on an order that has since been delivered.
  async function submitFailed() {
    if (!orderId || !data || !failReason) return;
    const stage = data.order.stage;
    if (typeof stage !== 'number') {
      toast(
        t('agent.err.noStage', 'Could not read this order’s stage. Reload and try again.'),
        'er',
      );
      return;
    }
    setFailBusy(true);
    try {
      const coords = (await getCurrentPosition()) ?? undefined;
      await api.reportDeliveryFailedOffline(
        orderId,
        stage,
        failReason,
        failNote.trim() || undefined,
        coords,
      );
      toast(t('agent.fail.done', 'Failed attempt recorded. The customer has been notified.'), 'ok');
      onChanged();
    } catch (e) {
      if (e instanceof OfflineQueuedError) {
        toast(
          t('agent.queued', 'No signal — saved on your device. It will sync automatically.'),
          'ok',
        );
        onChanged();
        return;
      }
      toast(e instanceof Error ? e.message : t('agent.fail.failed', 'Could not record it'), 'er');
      setFailBusy(false);
    }
  }

  const o = data?.order;
  const isCod = o?.pay_method === 'Cash on Delivery';
  const attempts = o?.delivery_attempts || 0;
  // i18n label for each canonical reason code.
  const reasonLabel = (r: DeliveryFailureReason) =>
    ({
      customer_unreachable: t('agent.fail.reason.unreachable', 'Customer unreachable'),
      customer_absent: t('agent.fail.reason.absent', 'Customer not available'),
      address_incorrect: t('agent.fail.reason.address', 'Address wrong or not found'),
      customer_refused: t('agent.fail.reason.refused', 'Customer refused the order'),
      rescheduled: t('agent.fail.reason.rescheduled', 'Asked to deliver later'),
      other: t('agent.fail.reason.other', 'Other'),
    })[r];

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

          {attempts > 0 ? (
            <div className="retry-banner" role="status">
              🔁 {t('agent.fail.retryBanner', { count: attempts })}
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

          <div className="a-card">
            <h3>🔐 {t('agent.deliver.otpTitle', 'Delivery code')}</h3>
            <p style={{ margin: '2px 0 8px', fontSize: 13, color: 'var(--muted)' }}>
              {t(
                'agent.deliver.otpHelp',
                'Ask the customer for their delivery code. Optional — you can still deliver without it.',
              )}
            </p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={4}
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              aria-label={t('agent.deliver.otpTitle', 'Delivery code')}
              style={{
                width: '100%',
                fontSize: 24,
                letterSpacing: '0.4em',
                textAlign: 'center',
                padding: '10px 12px',
                fontVariantNumeric: 'tabular-nums',
              }}
            />
          </div>

          <div className="a-card">
            <h3>📷 {t('agent.deliver.proofTitle', 'Proof of delivery')}</h3>
            <p style={{ margin: '2px 0 10px', fontSize: 13, color: 'var(--muted)' }}>
              {t('agent.deliver.proofHelp', 'Optional — a photo of the handed-over parcel.')}
            </p>
            <PhotoCapture
              value={proofPhoto}
              onChange={setProofPhoto}
              label={t('agent.deliver.proofAdd', 'Add photo')}
            />
          </div>

          {/* Couldn't-deliver branch: a reason picker that records an attempt without
              advancing the order. Only shown once the agent opens it, so it never
              competes with the primary Confirm action at the door. */}
          {failing ? (
            <div className="a-card fail-card">
              <h3>⚠️ {t('agent.fail.title', 'Couldn’t deliver?')}</h3>
              <p style={{ margin: '2px 0 10px', fontSize: 13, color: 'var(--muted)' }}>
                {t(
                  'agent.fail.help',
                  'Pick a reason. The customer is notified and the order stays out for a retry.',
                )}
              </p>
              <select
                className="a-select"
                value={failReason}
                onChange={(e) => setFailReason(e.target.value as DeliveryFailureReason)}
                aria-label={t('agent.fail.reasonLabel', 'Reason')}
              >
                <option value="">— {t('agent.fail.pickReason', 'Select a reason')} —</option>
                {DELIVERY_FAILURE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {reasonLabel(r)}
                  </option>
                ))}
              </select>
              <textarea
                value={failNote}
                onChange={(e) => setFailNote(e.target.value.slice(0, 500))}
                placeholder={t('agent.fail.notePlaceholder', 'Add a note (optional)')}
                aria-label={t('agent.fail.noteLabel', 'Note')}
                rows={2}
                style={{
                  width: '100%',
                  marginTop: 8,
                  padding: '10px 12px',
                  fontSize: 14,
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>
          ) : null}

          {/* The one field action rides a sticky ActionBar pinned to the foot of the
              sheet, so a delivery agent standing at the door reaches Confirm without
              scrolling past the map, items and payment. For a COD order the bar also
              carries the amount to collect — the number they must have in hand as they
              confirm. Sticky (not fixed): its normal-flow slot is the last row, so the
              content above always clears it at the bottom of the scroll. */}
          <ActionBar
            sticky
            summary={
              isCod && !failing ? (
                <>
                  <span>{t('agent.deliver.collectCod', 'Collect Cash on Delivery')}</span>
                  <span className="tabular-nums">{fmtMoney(o.total)}</span>
                </>
              ) : undefined
            }
          >
            {failing ? (
              <>
                <button
                  className="confirm-btn confirm-btn--danger"
                  style={{ marginTop: 0, boxShadow: 'none' }}
                  onClick={submitFailed}
                  disabled={failBusy || !failReason}
                >
                  {failBusy
                    ? t('agent.fail.busy', 'Recording…')
                    : `⚠️ ${t('agent.fail.cta', 'Record failed attempt')}`}
                </button>
                <button
                  type="button"
                  className="fail-toggle"
                  onClick={() => setFailing(false)}
                  disabled={failBusy}
                >
                  ← {t('agent.fail.back', 'Back to delivery')}
                </button>
              </>
            ) : (
              <>
                <button
                  className="confirm-btn"
                  style={{ marginTop: 0, boxShadow: 'none' }}
                  onClick={confirm}
                  disabled={busy}
                >
                  {busy
                    ? t('agent.deliver.busy', 'Confirming…')
                    : isCod
                      ? `✅ ${t('agent.deliver.ctaCod', 'Confirm Cash Collected & Delivered')}`
                      : `✅ ${t('agent.deliver.cta', 'Confirm Delivered')}`}
                </button>
                <button
                  type="button"
                  className="fail-toggle"
                  onClick={() => setFailing(true)}
                  disabled={busy}
                >
                  {t('agent.fail.open', 'Couldn’t deliver?')}
                </button>
              </>
            )}
          </ActionBar>
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

  // Turn-by-turn to the door. Prefer the geocoded drop (dest_lat/lng, migration 042)
  // for a precise pin; fall back to the written address as a text query. Opens the
  // phone's maps app (Google Maps universal URL) — never blocks the delivery flow.
  const hasCoords = order.dest_lat != null && order.dest_lng != null;
  const navUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${order.dest_lat},${order.dest_lng}`
    : daText
      ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(daText)}`
      : null;

  return (
    <div className="a-card">
      <h3>📍 {t('consumer.checkout.deliveryAddress', 'Delivery Address')}</h3>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 3 }}>
        {order.consumer_name || t('agent.consumer', 'Consumer')}
        {label ? ` · ${t(addressLabelKey(label), label)}` : ''}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--forest)' }}>{daText || '—'}</div>
      <div className="contact-row">
        {navUrl ? (
          <a className="nav-link" href={navUrl} target="_blank" rel="noopener noreferrer">
            🧭 {t('agent.deliver.navigate', 'Navigate')}
          </a>
        ) : null}
        {callPhone ? (
          <a className="call-link" href={`tel:${callPhone}`}>
            📞 {t('agent.deliver.call', 'Call Customer')}
          </a>
        ) : null}
      </div>
    </div>
  );
}
