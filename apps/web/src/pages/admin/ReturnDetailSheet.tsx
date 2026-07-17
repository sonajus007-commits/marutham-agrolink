import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Sheet } from '@marutham/ui';
import { api, type AdminReturn } from '@marutham/api-client';
import { fmtDate, fmtMoney } from '@marutham/lib';
import { useToast } from '../../components/Toast';

/** Return lifecycle → the single status the row/sheet shows. */
export function returnStatus(r: AdminReturn): 'pending' | 'accepted' | 'rejected' | 'collected' {
  if (r.collected) return 'collected';
  if (r.decision === 'rejected') return 'rejected';
  if (r.decision === 'accepted') return 'accepted';
  return 'pending';
}

export const RETURN_STATUS_TONE: Record<string, string> = {
  pending: 'var(--warning-strong)',
  accepted: 'var(--info)',
  rejected: 'var(--danger)',
  collected: 'var(--success)',
};

export function ReturnDetailSheet({
  ret,
  open,
  onClose,
  onChanged,
}: {
  ret: AdminReturn | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showCollect, setShowCollect] = useState(false);

  if (!ret)
    return (
      <Sheet open={open} title={t('admin.ret.title')} onClose={onClose}>
        <div />
      </Sheet>
    );

  const status = returnStatus(ret);
  const refund = fmtMoney(ret.refund_amt);

  async function act(fn: () => Promise<{ message: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      toast(res.message || t('admin.ret.done'), 'ok');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'er');
    } finally {
      setBusy(false);
      setShowCollect(false);
    }
  }

  return (
    <Sheet open={open} title={ret.code} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-pill px-3 py-1 text-xs font-bold text-white"
            style={{ background: RETURN_STATUS_TONE[status] }}
          >
            {t('admin.ret.status.' + status)}
          </span>
          <span className="text-2xs uppercase tracking-wide text-fg-muted">
            {ret.full_return ? t('admin.ret.full') : t('admin.ret.partial')}
          </span>
        </div>

        <Section title={`↩️ ${t('admin.ret.summary')}`}>
          <Row label={t('admin.ret.code')} value={ret.code} mono />
          {ret.order?.code ? (
            <Row label={t('admin.ret.order')} value={ret.order.code} mono />
          ) : null}
          {ret.order?.consumer_name ? (
            <Row label={t('admin.ret.customer')} value={ret.order.consumer_name} />
          ) : null}
          {ret.order?.district ? (
            <Row label={t('admin.ret.district')} value={ret.order.district} />
          ) : null}
          <Row label={t('admin.ret.refund')} value={refund} strong />
          {ret.refund_to ? <Row label={t('admin.ret.refundTo')} value={ret.refund_to} /> : null}
          {ret.requested_at ? (
            <Row
              label={t('admin.ret.requestedOn')}
              value={fmtDate(ret.requested_at, i18n.language)}
            />
          ) : null}
          {ret.decided_at ? (
            <Row label={t('admin.ret.decidedOn')} value={fmtDate(ret.decided_at, i18n.language)} />
          ) : null}
        </Section>

        {/* Actions, gated by lifecycle state */}
        {status === 'pending' ? (
          <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
            <p className="text-2xs text-fg-muted">{t('admin.ret.decideHint')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => act(() => api.decideReturn(ret.id, 'accepted'))}
                disabled={busy}
              >
                {t('admin.ret.accept')}
              </Button>
              <Button
                variant="danger"
                onClick={() => act(() => api.decideReturn(ret.id, 'rejected'))}
                disabled={busy}
              >
                {t('admin.ret.reject')}
              </Button>
            </div>
          </section>
        ) : null}

        {status === 'accepted' ? (
          <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
            <p className="text-2xs text-fg-muted">{t('admin.ret.collectHint')}</p>
            <div>
              <Button onClick={() => setShowCollect(true)} disabled={busy}>
                {t('admin.ret.collect')}
              </Button>
            </div>
          </section>
        ) : null}

        {status === 'collected' ? (
          <p className="rounded-base bg-surface-muted px-3 py-2 text-2xs text-success">
            {t('admin.ret.refunded', { amount: refund })}
          </p>
        ) : null}
        {status === 'rejected' ? (
          <p className="rounded-base bg-surface-muted px-3 py-2 text-2xs text-fg-muted">
            {t('admin.ret.wasRejected')}
          </p>
        ) : null}
      </div>

      <Modal
        open={showCollect}
        title={t('admin.ret.collectConfirm')}
        subtitle={ret.code}
        onClose={() => setShowCollect(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCollect(false)} disabled={busy}>
              {t('admin.ret.cancel')}
            </Button>
            <Button onClick={() => act(() => api.collectReturn(ret.id))} disabled={busy}>
              {busy ? '…' : t('admin.ret.collect')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">
          {t('admin.ret.collectConfirmBody', { amount: refund, to: ret.refund_to || '—' })}
        </p>
      </Modal>
    </Sheet>
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
