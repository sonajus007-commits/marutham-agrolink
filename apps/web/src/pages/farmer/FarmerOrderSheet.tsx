import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ConfirmDialog, OrderPipeline, OrderTimeline, Sheet, Spinner } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useToast } from '../../components/Toast';
import {
  buildPipeline,
  displayStatus,
  fmtDate,
  fmtMoney,
  getProductEmoji,
  isOrderCancelled,
  payMethodKey,
  payStatusKey,
  statusColor,
  statusKey,
  type DeclinedOrderItem,
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
  // Item-level decline: the lines ticked to decline, the confirm for a partial
  // decline, this seller's already-declined lines, and a "re-read the detail" tick.
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmPartial, setConfirmPartial] = useState(false);
  const [declined, setDeclined] = useState<DeclinedOrderItem[]>([]);
  const [localPartial, setLocalPartial] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open || !order) return;
    let active = true;
    setItems(null);
    setHistory([]);
    setError(null);
    setPicked(new Set());
    if (reloadKey === 0) {
      setLocalStatus(null);
      setLocalPartial(false);
    }
    api
      .getOrder(order.id)
      .then((detail) => {
        if (!active) return;
        const mine = (detail.items || []).filter((it) => it.farmer_id === user?.id);
        setItems(mine);
        setDeclined((detail.declined_items || []).filter((it) => it.farmer_id === user?.id));
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
  }, [open, order, user?.id, reloadKey]);
  // A different order (or reopening) starts clean.
  useEffect(() => setReloadKey(0), [open, order]);

  // The English value drives statusColor; only the spoken form is translated.
  // localStatus wins when set, so the pipeline + badge reflect the action we just did.
  const rawStatus = localStatus ?? (order ? String(order.status ?? '') : '');
  const status = order
    ? displayStatus(
        { ...order, partially_accepted: order.partially_accepted || localPartial },
        rawStatus,
      )
    : '';

  // The seller's status actions, each only for an order that carries their produce.
  // The server re-checks role, status, has-items and the deadline, so these are UX.
  const hasItems = (items?.length ?? 0) > 0;
  const activeForMe = !!order && !isOrderCancelled(order) && hasItems;
  const canAccept = activeForMe && rawStatus === 'Order Received';
  const canPack = activeForMe && rawStatus === 'Order Accepted';

  // Declining — whole order or some lines — is offered only inside the acceptance
  // window. Once accepted, the seller has committed and can only pack it. Ticking
  // every line is the same as declining the whole order.
  const itemPick = canAccept && (items?.length ?? 0) > 1;
  const pickedCount = picked.size;
  const allPicked = itemPick && pickedCount === (items?.length ?? 0);
  const somePicked = itemPick && pickedCount > 0 && !allPicked;
  const togglePick = (id: string) =>
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setPicked(
      allPicked ? new Set() : new Set((items || []).map((it) => it.id || '').filter(Boolean)),
    );

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

  async function declinePicked(reason?: string) {
    if (!order) return;
    setConfirmPartial(false);
    setBusy(true);
    try {
      const res = await api.declineOrderItems(order.id, [...picked], reason);
      if (res.declined === 'all') {
        setLocalStatus('Cancelled');
      } else {
        setLocalStatus('Order Accepted');
        setLocalPartial(true);
      }
      toast(res.message || t('farmer.orders.itemsDeclined', 'Items declined.'), 'ok');
      setReloadKey((k) => k + 1);
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

  // The action row: with nothing ticked it is the usual Accept / Pack + Decline;
  // with some lines ticked it declines just those; with every line ticked it
  // declines the whole order.
  const declineSelectedRow = somePicked ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="danger" onClick={() => setConfirmPartial(true)} disabled={busy}>
        {t('farmer.orders.declinePickedAccept', 'Decline {{count}} item(s) & accept the rest', {
          count: pickedCount,
        })}
      </Button>
      <Button variant="ghost" onClick={() => setPicked(new Set())} disabled={busy}>
        {t('farmer.orders.clearPick', 'Clear selection')}
      </Button>
    </div>
  ) : allPicked ? (
    <div className="flex flex-wrap gap-2">
      <Button variant="danger" onClick={() => setConfirmDecline(true)} disabled={busy}>
        {t('farmer.orders.declineAll', 'Decline whole order')}
      </Button>
      <Button variant="ghost" onClick={() => setPicked(new Set())} disabled={busy}>
        {t('farmer.orders.clearPick', 'Clear selection')}
      </Button>
    </div>
  ) : null;

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

          {declineSelectedRow}

          {canAccept && !declineSelectedRow ? (
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

          {canPack && !declineSelectedRow ? (
            <div className="flex gap-2">
              <Button variant="primary" onClick={pack} disabled={busy}>
                {busy
                  ? t('farmer.orders.working', 'Working…')
                  : `📦 ${t('farmer.orders.markPackaged', 'Mark Packed')}`}
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

          <ConfirmDialog
            open={confirmPartial}
            title={t('farmer.orders.declinePickedTitle', 'Decline {{count}} item(s)?', {
              count: pickedCount,
            })}
            subtitle={(items || [])
              .filter((it) => it.id && picked.has(it.id))
              .map((it) => it.name)
              .join(', ')}
            confirmLabel={t('farmer.orders.decline', 'Decline')}
            cancelLabel={t('common.cancel', 'Cancel')}
            tone="danger"
            busy={busy}
            reason={{
              label: t('farmer.orders.declineReason', 'Reason (optional)'),
              placeholder: t('farmer.orders.declineReasonHint', 'e.g. crop damaged, sold out'),
            }}
            onConfirm={(reason) => declinePicked(reason)}
            onClose={() => setConfirmPartial(false)}
          >
            {t(
              'farmer.orders.declinePickedBodyAccept',
              'These items are removed and the customer is refunded and told. The rest of the order is accepted and shows as Partially Accepted. This cannot be undone.',
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
            {itemPick ? (
              <p className="mb-2 text-xs text-fg-muted">
                {t(
                  'farmer.orders.pickHint',
                  'Can’t supply something? Tick those items to decline just them.',
                )}
              </p>
            ) : null}
            {items.length === 0 ? (
              <p className="text-xs text-fg-muted">{t('farmer.orders.noItems')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {itemPick ? (
                  <li className="fm-pick-row fm-pick-row--all">
                    <label className="fm-pick">
                      <input
                        type="checkbox"
                        checked={allPicked}
                        ref={(el) => {
                          if (el) el.indeterminate = somePicked;
                        }}
                        onChange={toggleAll}
                        disabled={busy}
                        aria-label={t('farmer.orders.pickAll', 'Select all items')}
                      />
                      <span>{t('farmer.orders.pickAll', 'Select all items')}</span>
                    </label>
                  </li>
                ) : null}
                {items.map((item, idx) => {
                  const id = item.id || '';
                  const on = !!id && picked.has(id);
                  const body = (
                    <>
                      <span className="font-semibold text-fg">
                        {getProductEmoji(item.name)} {item.name}
                      </span>
                      <span className="text-2xs text-fg-muted">
                        {item.qty} {item.unit || ''}
                      </span>
                    </>
                  );
                  return (
                    <li key={id || idx} className={`fm-pick-row${on ? ' is-picked' : ''}`}>
                      {itemPick && id ? (
                        <label className="fm-pick fm-pick--item">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => togglePick(id)}
                            disabled={busy}
                            aria-label={t('farmer.orders.pickItem', 'Decline {{name}}', {
                              name: item.name,
                            })}
                          />
                          <span className="fm-pick__body">{body}</span>
                        </label>
                      ) : (
                        <span className="fm-pick__body">{body}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {declined.length > 0 ? (
            <section className="rounded-base border border-border-subtle bg-surface p-4">
              <h3 className="mb-2 text-sm font-bold text-danger">
                🚫 {t('farmer.orders.declinedItems', 'Declined by you')}
              </h3>
              <ul className="flex flex-col gap-2">
                {declined.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-fg-muted line-through">
                      {getProductEmoji(d.name)} {d.name}
                    </span>
                    <span className="text-2xs text-fg-muted">
                      {Number(d.qty)} {d.unit || ''}
                      {d.reason ? ` · ${d.reason}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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
