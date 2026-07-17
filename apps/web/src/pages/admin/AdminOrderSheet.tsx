import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  INPUT_CLASS,
  Modal,
  OrderPipeline,
  OrderTimeline,
  Sheet,
  Spinner,
} from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  buildPipeline,
  canCancelOrder,
  deriveOrderCharges,
  fmtDate,
  fmtMoney,
  getProductEmoji,
  isOrderCancelled,
  itemLineTotal,
  resolveAddress,
  statusColor,
  PIPELINE_STAGES,
  type OrderDetail,
  payMethodKey,
  payStatusKey,
} from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { useAuth } from '../../auth/AuthContext';

// Mirrors the backend gate on POST /orders/:id/status. Only these roles get the
// manual status-override control; everyone else sees the read-only sheet.
const MANUAL_STATUS_ADMIN_ROLES = [
  'Head Office',
  'State Head',
  'Regional Manager',
  'District Manager',
  'Hub Incharge',
];

/**
 * Admin order detail. Unlike the seller sheet this shows the FULL order — buyer
 * contact + address and every farmer's line — because management staff legitimately
 * handle the whole order. The one write action is Cancel (POST /orders/:id/cancel,
 * which the backend allows for admins on cancellable stages).
 */
export function AdminOrderSheet({
  orderId,
  open,
  onClose,
  onChanged,
}: {
  orderId: string | null;
  open: boolean;
  onClose: () => void;
  /** Cancel succeeded — parent refetches the list. */
  onChanged: () => void;
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
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load order'));
    return () => {
      active = false;
    };
  }, [open, orderId]);

  return (
    <Sheet open={open} title={data?.order.code || t('admin.orders.title')} onClose={onClose}>
      {error ? (
        <div className="p-6 text-center text-sm text-danger">{error}</div>
      ) : !data ? (
        <Spinner />
      ) : (
        <Body
          data={data}
          onChanged={() => {
            onChanged();
            onClose();
          }}
        />
      )}
    </Sheet>
  );
}

function Body({ data, onChanged }: { data: OrderDetail; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { order: o, items, history, qr_svg } = data;
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [targetStatus, setTargetStatus] = useState('');
  const [settingStatus, setSettingStatus] = useState(false);

  const charges = deriveOrderCharges(o);
  const address = resolveAddress(o.delivery_address);
  const statusLabel = isOrderCancelled(o) ? 'Cancelled' : o.status;

  // Manual override: senior admins only, and never on a cancelled order (that
  // lifecycle is terminal). Offer the statuses valid for THIS order's route,
  // minus the one it is already at — matching the server's validation.
  const canOverride =
    !isOrderCancelled(o) && MANUAL_STATUS_ADMIN_ROLES.includes(user?.admin_role ?? '');
  const isHub = (o.route || 'direct') === 'hub';
  const statusOptions = PIPELINE_STAGES.filter(
    (s) => (isHub || (s !== 'In Transit' && s !== 'At Hub')) && s !== o.status,
  );

  async function setStatus() {
    if (!targetStatus) return;
    setSettingStatus(true);
    try {
      const res = await api.setOrderStatus(o.id, targetStatus);
      toast(res.message || t('admin.orders.statusSet', 'Order status updated.'), 'ok');
      onChanged();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.orders.statusFailed', 'Could not set status'),
        'er',
      );
    } finally {
      setSettingStatus(false);
    }
  }

  async function cancel() {
    setBusy(true);
    try {
      await api.cancelOrder(o.id, reason.trim() || undefined);
      toast(t('admin.orders.cancelled'), 'ok');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not cancel order', 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-base border border-border-subtle bg-surface p-3">
        <OrderPipeline nodes={buildPipeline(o.route || 'direct', o.status)} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-pill px-3 py-1 text-xs font-bold text-white"
          style={{ background: statusColor(statusLabel) }}
        >
          {statusLabel}
        </span>
        {canCancelOrder(o) ? (
          <Button variant="danger" onClick={() => setShowCancel(true)}>
            {t('admin.orders.cancel')}
          </Button>
        ) : null}
      </div>

      {canOverride && statusOptions.length > 0 ? (
        <Section title={`🛠 ${t('admin.orders.setStatus', 'Set Status Manually')}`}>
          <p className="mb-2 text-2xs text-fg-muted">
            {t(
              'admin.orders.setStatusHint',
              'Override the order stage — forward or back. Logged to the timeline.',
            )}
          </p>
          <div className="flex items-center gap-2">
            <select
              className={INPUT_CLASS}
              aria-label={t('admin.orders.setStatus', 'Set Status Manually')}
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
            >
              <option value="">— {t('admin.orders.chooseStatus', 'Choose status')} —</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={setStatus} disabled={!targetStatus || settingStatus}>
              {settingStatus ? '…' : t('admin.orders.apply', 'Apply')}
            </Button>
          </div>
        </Section>
      ) : null}

      <Section title={`📋 ${t('admin.orders.info')}`}>
        <Row label={t('admin.orders.code')} value={o.code || '—'} />
        <Row label={t('admin.orders.placedOn')} value={fmtDate(o.created_at, i18n.language)} />
        <Row
          label={t('admin.orders.payment')}
          value={`${o.pay_method ? t(payMethodKey(o.pay_method), o.pay_method) : '—'} · ${
            o.pay_status ? t(payStatusKey(o.pay_status), o.pay_status) : ''
          }`}
        />
        {o.delivered_at ? (
          <Row label={t('admin.orders.delivered')} value={fmtDate(o.delivered_at, i18n.language)} />
        ) : null}
        {o.agent_name ? <Row label={t('admin.orders.agent')} value={o.agent_name} /> : null}
      </Section>

      <Section title={`👤 ${t('admin.orders.customer')}`}>
        <Row label={t('admin.orders.name')} value={o.consumer_name || '—'} />
        {o.consumer_phone ? (
          <Row label={t('admin.orders.phone')} value={o.consumer_phone} mono />
        ) : null}
        <div className="pt-1.5 text-2xs text-fg-muted">{address || '—'}</div>
      </Section>

      <Section title={`🌿 ${t('admin.orders.items')}`}>
        <ul className="flex flex-col gap-2">
          {items.map((item, idx) => (
            <li key={item.id || idx} className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="text-sm font-semibold text-fg">
                  {getProductEmoji(item.name)} {item.name}
                </span>
                <span className="block text-2xs text-fg-muted">
                  {item.qty} {item.unit || ''} × {fmtMoney(item.price)}
                  {item.farmer_name ? ` · ${item.farmer_name}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-sm font-bold">{fmtMoney(itemLineTotal(item))}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={`💰 ${t('admin.orders.breakdown')}`}>
        <Row label={t('admin.orders.itemTotal')} value={fmtMoney(charges.itemTotal)} />
        {charges.handling > 0 ? (
          <Row label={t('admin.orders.handling')} value={fmtMoney(charges.handling)} />
        ) : null}
        {charges.marketFee > 0 ? (
          <Row label={t('admin.orders.marketFee')} value={fmtMoney(charges.marketFee)} />
        ) : null}
        <Row
          label={t('admin.orders.delivery')}
          value={charges.delivery > 0 ? fmtMoney(charges.delivery) : t('admin.orders.free')}
        />
        <Row label={t('admin.orders.total')} value={fmtMoney(charges.total)} strong />
      </Section>

      {history.length ? (
        <Section title={`📍 ${t('admin.orders.timeline')}`}>
          <OrderTimeline entries={history} />
        </Section>
      ) : null}

      {qr_svg ? (
        <Section title={`📷 ${t('admin.orders.qr')}`}>
          <div className="flex flex-col items-center gap-1">
            <div
              className="rounded-sm bg-surface p-2 leading-none"
              dangerouslySetInnerHTML={{ __html: qr_svg }}
            />
            <div className="font-mono text-sm font-bold text-primary">{o.code}</div>
          </div>
        </Section>
      ) : null}

      <Modal
        open={showCancel}
        title={t('admin.orders.cancelConfirm')}
        subtitle={o.code}
        onClose={() => setShowCancel(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCancel(false)} disabled={busy}>
              {t('admin.orders.keep')}
            </Button>
            <Button variant="danger" onClick={cancel} disabled={busy}>
              {busy ? '…' : t('admin.orders.cancel')}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
          {t('admin.orders.reason')}
        </label>
        <textarea
          className={INPUT_CLASS}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin.orders.reasonPlaceholder')}
        />
      </Modal>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-base border border-border-subtle bg-surface p-4">
      <h3 className="mb-2 text-sm font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Row({
  label,
  value,
  mono = false,
  strong = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span
        className={`text-sm ${strong ? 'font-bold' : 'font-semibold'} text-fg ${mono ? 'tabular-nums' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
