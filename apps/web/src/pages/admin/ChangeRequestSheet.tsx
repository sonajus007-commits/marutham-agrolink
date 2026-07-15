import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, INPUT_CLASS, Sheet } from '@marutham/ui';
import { api, type ProfileChangeRequest } from '@marutham/api-client';
import { fmtDateShort, fmtMoney } from '@marutham/lib';
import { useToast } from '../../components/Toast';

export const CR_STATUS_TONE: Record<string, string> = {
  pending: 'var(--warning-strong)',
  payment_pending: 'var(--info, var(--leaf))',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

/** requested_changes key → readable label. Mirrors the legacy admin LABELS map. */
const FIELD_LABELS: Record<string, string> = {
  bank_name: 'Bank Name',
  bank_account: 'Account No',
  ifsc: 'IFSC',
  gst_number: 'GST',
  business_name: 'Business Name',
  business_type: 'Business Type',
};

export const isRenewal = (r: ProfileChangeRequest) => !!r.requested_changes?.subscription_renewal;

export function ChangeRequestSheet({
  request,
  open,
  onClose,
  onChanged,
}: {
  request: ProfileChangeRequest | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState('');
  const [amount, setAmount] = useState('');

  // Reset the form whenever a different request opens.
  const [seenId, setSeenId] = useState<string | null>(null);
  if (request && request.id !== seenId) {
    setSeenId(request.id);
    setNotes('');
    setAmount('');
  }

  if (!request)
    return (
      <Sheet open={open} title={t('admin.cr.title')} onClose={onClose}>
        <div />
      </Sheet>
    );

  const renewal = isRenewal(request);
  const status = String(request.status);
  const pending = status === 'pending';
  const paymentPending = status === 'payment_pending';

  async function act(fn: () => Promise<{ message: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      toast(res.message || t('admin.cr.done'), 'ok');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'er');
    } finally {
      setBusy(false);
    }
  }

  function approve() {
    if (renewal) {
      const rs = parseFloat(amount);
      if (!rs || rs <= 0) {
        toast(t('admin.cr.amountRequired'), 'er');
        return;
      }
      void act(() =>
        api.approveChangeRequest(request!.id, {
          notes: notes.trim() || undefined,
          renewal_amount: rs,
        }),
      );
    } else {
      void act(() => api.approveChangeRequest(request!.id, { notes: notes.trim() || undefined }));
    }
  }

  return (
    <Sheet
      open={open}
      title={renewal ? t('admin.cr.renewalTitle') : t('admin.cr.title')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-pill px-3 py-1 text-xs font-bold text-white"
            style={{ background: CR_STATUS_TONE[status] || 'var(--fg-muted)' }}
          >
            {t('admin.cr.status.' + status, status)}
          </span>
          {renewal ? (
            <span className="text-2xs uppercase tracking-wide text-fg-muted">
              🔄 {t('admin.cr.renewal')}
            </span>
          ) : null}
        </div>

        <Section title={`👤 ${t('admin.cr.seller')}`}>
          <Row label={t('admin.cr.name')} value={request.fname || '—'} />
          <Row label={t('admin.cr.loginId')} value={request.login_id || '—'} mono />
          {request.subscription_plan ? (
            <Row label={t('admin.cr.currentPlan')} value={String(request.subscription_plan)} />
          ) : null}
          {request.subscription_expires_at ? (
            <Row
              label={t('admin.cr.expires')}
              value={fmtDateShort(request.subscription_expires_at)}
            />
          ) : null}
          {request.requested_at ? (
            <Row label={t('admin.cr.requestedOn')} value={fmtDateShort(request.requested_at)} />
          ) : null}
        </Section>

        {renewal ? (
          <Section title={`🔄 ${t('admin.cr.requestedRenewal')}`}>
            <Row
              label={t('admin.cr.newPlan')}
              value={String(request.requested_changes?.new_plan || '—')}
            />
          </Section>
        ) : (
          <Section title={`📝 ${t('admin.cr.requestedChanges')}`}>
            {Object.entries(request.requested_changes || {}).map(([k, v]) => (
              <Row key={k} label={FIELD_LABELS[k] || k} value={String(v)} />
            ))}
          </Section>
        )}

        {paymentPending && request.payment_reference ? (
          <section className="rounded-base border border-border-subtle bg-surface-muted p-3">
            <p className="text-2xs text-fg-muted">{t('admin.cr.confirmHint')}</p>
            <Row label={t('admin.cr.paymentRef')} value={String(request.payment_reference)} mono />
            {/* renewal_amount is PAISE — the /100 stays. It is the amount the
                seller says they paid, so it now shows the paise too rather than
                rounding the figure we are asked to reconcile against. */}
            {request.renewal_amount ? (
              <Row
                label={t('admin.cr.amount')}
                value={fmtMoney(request.renewal_amount / 100)}
                mono
              />
            ) : null}
          </section>
        ) : null}

        {request.notes && !pending ? (
          <div className="text-2xs text-fg-muted">
            {t('admin.cr.notes')}: {request.notes}
          </div>
        ) : null}

        {/* Controls */}
        {pending ? (
          <section className="flex flex-col gap-3 rounded-base border border-border-subtle bg-surface-muted p-3">
            {renewal ? (
              <div>
                <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
                  {t('admin.cr.amountLabel')}
                </label>
                <input
                  className={INPUT_CLASS}
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('admin.cr.amountPlaceholder')}
                />
              </div>
            ) : null}
            <div>
              <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
                {t('admin.cr.notesLabel')}
              </label>
              <textarea
                className={INPUT_CLASS}
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('admin.cr.notesPlaceholder')}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={approve} disabled={busy}>
                {renewal ? t('admin.cr.approveRenewal') : t('admin.cr.approve')}
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (!notes.trim()) {
                    toast(t('admin.cr.rejectReasonRequired'), 'er');
                    return;
                  }
                  void act(() => api.rejectChangeRequest(request!.id, notes.trim()));
                }}
                disabled={busy}
              >
                {t('admin.cr.reject')}
              </Button>
            </div>
          </section>
        ) : null}

        {paymentPending ? (
          <div>
            <Button
              onClick={() => void act(() => api.confirmRenewalPayment(request!.id))}
              disabled={busy}
            >
              {t('admin.cr.confirmPayment')}
            </Button>
          </div>
        ) : null}
      </div>
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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={`text-sm font-semibold text-fg ${mono ? 'tabular-nums' : ''}`}>{value}</span>
    </div>
  );
}
