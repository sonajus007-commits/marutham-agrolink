import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog, OrderPipeline, OrderTimeline, Sheet, Spinner } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useToast } from '../../components/Toast';
import {
  buildPipeline,
  fmtDate,
  fmtMoney,
  getProductEmoji,
  isOrderCancelled,
  payMethodKey,
  payStatusKey,
  statusColor,
  statusKey,
  type Order,
  type OrderHistoryEntry,
  type OrderItem,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';

/**
 * Seller-facing order detail. Deliberately PII-safe: GET /orders/:id returns the
 * consumer's phone + full address and EVERY farmer's items on the order, but a
 * seller has no business seeing another farmer's produce or the buyer's contact
 * details. So we fetch only items + history here, keep the reliable rupee
 * `farmer_payout` and delivery `village` off the list `Order` passed in, and show
 * only the items whose `farmer_id` is this seller.
 */
export function FarmerOrderSheet({
  order,
  open,
  onClose,
  onChanged,
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  /** Called after the seller advances the order (e.g. marks it Packaged) so the
   *  parent list refetches — the row's status is now stale. */
  onChanged?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<OrderItem[] | null>(null);
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Optimistic status after a successful accept/pack/decline: the prop `order` is the
  // list row, which we do not mutate. Null until the seller acts in this session.
  const [localStatus, setLocalStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);

  useEffect(() => {
    if (!open || !order) return;
    let active = true;
    setItems(null);
    setHistory([]);
    setError(null);
    setLocalStatus(null);
    api
      .getOrder(order.id)
      .then((detail) => {
        if (!active) return;
        const mine = (detail.items || []).filter((it) => it.farmer_id === user?.id);
        setItems(mine);
        // The status-timeline notes are server-authored and name the buyer
        // (e.g. "…placed by Kavitha R."). A seller has no need for the buyer's
        // name, so redact it out of the notes before showing them.
        setHistory(scrubBuyerName(detail.history || [], order.consumer_name));
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
  }, [open, order, user?.id]);

  // The English value drives statusColor; only the spoken form is translated.
  // localStatus wins when set, so the pipeline + badge reflect the action we just did.
  const rawStatus = localStatus ?? (order ? String(order.status ?? '') : '');
  const status = order ? (isOrderCancelled(order) ? 'Cancelled' : rawStatus) : '';

  // The seller's status actions, each only for an order that carries their produce.
  // The server re-checks role, status, has-items and the deadline, so these are UX.
  const hasItems = (items?.length ?? 0) > 0;
  const activeForMe = !!order && !isOrderCancelled(order) && hasItems;
  const canAccept = activeForMe && rawStatus === 'Order Received';
  const canPack = activeForMe && rawStatus === 'Order Accepted';

  // Minutes left in the acceptance window, for the countdown shown while un-accepted.
  const deadlineMs = order?.accept_deadline ? new Date(order.accept_deadline).getTime() : null;
  const minsLeft = deadlineMs ? Math.round((deadlineMs - Date.now()) / 60000) : null;

  async function accept() {
    if (!order) return;
    setBusy(true);
    try {
      const res = await api.acceptOrder(order.id);
      setLocalStatus('Order Accepted');
      toast(res.message || t('farmer.orders.accepted', 'Order accepted.'), 'ok');
      onChanged?.();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : t('farmer.orders.acceptFailed', 'Could not accept the order'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  async function pack() {
    if (!order) return;
    setBusy(true);
    try {
      const res = await api.markPackaged(order.id);
      setLocalStatus('Packed');
      toast(res.message || t('farmer.orders.packed', 'Order marked as Packed.'), 'ok');
      onChanged?.();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('farmer.orders.packFailed', 'Could not mark as packed'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  async function decline(reason?: string) {
    if (!order) return;
    setConfirmDecline(false);
    setBusy(true);
    try {
      const res = await api.declineOrder(order.id, reason);
      setLocalStatus('Cancelled');
      toast(res.message || t('farmer.orders.declined', 'Order declined.'), 'ok');
      onChanged?.();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : t('farmer.orders.declineFailed', 'Could not decline the order'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={order?.code || t('farmer.orders.title')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      {!order ? null : error ? (
        <div className="p-6 text-center text-sm text-danger">{error}</div>
      ) : items === null ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="rounded-base border border-border-subtle bg-surface p-3">
            <OrderPipeline
              nodes={buildPipeline(order.route || 'direct', rawStatus)}
              labelFor={(l) => t(statusKey(l), l)}
            />
          </div>

          <span
            className="self-start rounded-pill px-3 py-1 text-xs font-bold text-white"
            style={{ background: statusColor(status) }}
          >
            {t(statusKey(status), status)}
          </span>

          {canAccept && minsLeft !== null ? (
            <p className="self-start text-xs text-muted">
              {minsLeft > 0
                ? t(
                    'farmer.orders.acceptWindow',
                    'Accept within ~{{mins}} min or this order is auto-cancelled.',
                    {
                      mins: minsLeft,
                    },
                  )
                : t(
                    'farmer.orders.acceptWindowClosing',
                    'The acceptance window is closing — accept now.',
                  )}
            </p>
          ) : null}

          {canAccept ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={accept} disabled={busy}>
                {busy
                  ? t('farmer.orders.working', 'Working…')
                  : `✅ ${t('farmer.orders.accept', 'Accept order')}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDecline(true)} disabled={busy}>
                {t('farmer.orders.decline', 'Decline')}
              </Button>
            </div>
          ) : null}

          {canPack ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={pack} disabled={busy}>
                {busy
                  ? t('farmer.orders.working', 'Working…')
                  : `📦 ${t('farmer.orders.markPackaged', 'Mark Packed')}`}
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDecline(true)} disabled={busy}>
                {t('farmer.orders.decline', 'Decline')}
              </Button>
            </div>
          ) : null}

          <ConfirmDialog
            open={confirmDecline}
            title={t('farmer.orders.declineTitle', 'Decline this order?')}
            subtitle={order.code}
            confirmLabel={t('farmer.orders.decline', 'Decline')}
            cancelLabel={t('common.cancel', 'Cancel')}
            tone="danger"
            busy={busy}
            reason={{
              label: t('farmer.orders.declineReason', 'Reason (optional)'),
              placeholder: t('farmer.orders.declineReasonHint', 'e.g. crop damaged, sold out'),
            }}
            onConfirm={(reason) => decline(reason)}
            onClose={() => setConfirmDecline(false)}
          >
            {t(
              'farmer.orders.declineBody',
              'The customer is refunded and notified, and declining lowers your reliability. This cannot be undone.',
            )}
          </ConfirmDialog>

          <section className="rounded-base border border-border-subtle bg-surface p-4">
            <h3 className="mb-2 text-sm font-bold text-primary">📋 {t('farmer.orders.info')}</h3>
            <InfoRow label={t('farmer.orders.code')} value={order.code || '—'} />
            <InfoRow
              label={t('farmer.orders.placedOn')}
              value={fmtDate(order.created_at, i18n.language)}
            />
            <InfoRow
              label={t('farmer.orders.payment')}
              value={`${order.pay_method ? t(payMethodKey(order.pay_method), order.pay_method) : '—'} · ${
                order.pay_status ? t(payStatusKey(order.pay_status), order.pay_status) : ''
              }`}
            />
            {order.village ? (
              <InfoRow label={t('farmer.orders.deliveryArea')} value={order.village} />
            ) : null}
          </section>

          <section className="rounded-base border border-border-subtle bg-surface p-4">
            <h3 className="mb-2 text-sm font-bold text-primary">
              🌿 {t('farmer.orders.yourItems')}
            </h3>
            {items.length === 0 ? (
              <p className="text-xs text-fg-muted">{t('farmer.orders.noItems')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item, idx) => (
                  <li
                    key={item.id || idx}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="font-semibold text-fg">
                      {getProductEmoji(item.name)} {item.name}
                    </span>
                    <span className="text-2xs text-fg-muted">
                      {item.qty} {item.unit || ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex items-center justify-between rounded-base border border-border-subtle bg-surface-muted p-4">
            <span className="text-sm font-bold text-primary">💰 {t('farmer.orders.youEarn')}</span>
            <span className="text-lg font-black">{fmtMoney(order.farmer_payout)}</span>
          </section>

          {history.length ? (
            <section className="rounded-base border border-border-subtle bg-surface p-4">
              <h3 className="mb-2 text-sm font-bold text-primary">
                📍 {t('farmer.orders.timeline')}
              </h3>
              <OrderTimeline
                entries={history}
                labelFor={(l) => t(statusKey(l), l)}
                lang={i18n.language}
              />
            </section>
          ) : null}
        </div>
      )}
    </Sheet>
  );
}

/**
 * Redact the buyer's name from server-authored timeline notes. Handles both the
 * full name and its first-name token (a note may carry either), replacing the
 * longer form first so "…placed by Kavitha R." becomes "…placed by the customer".
 */
function scrubBuyerName(entries: OrderHistoryEntry[], buyerName?: string): OrderHistoryEntry[] {
  const name = (buyerName || '').trim();
  if (!name) return entries;
  const tokens = [name, name.split(/\s+/)[0]].filter((t) => t.length > 1);
  return entries.map((h) => {
    if (!h.note) return h;
    let note = h.note;
    for (const tok of tokens) note = note.split(tok).join('the customer');
    return note === h.note ? h : { ...h, note };
  });
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span className="text-sm font-semibold text-fg">{value}</span>
    </div>
  );
}
