import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, INPUT_CLASS, Modal, Sheet, Spinner } from '@marutham/ui';
import { api, type Registration } from '@marutham/api-client';
import { buildAddress, fmtDate, fmtDateShort } from '@marutham/lib';
import { useToast } from '../../components/Toast';

/** approval_status → semantic colour. Distinct from account status + order status. */
export const REG_STATUS_TONE: Record<string, string> = {
  pending_review: 'var(--warning-strong)',
  approved: 'var(--info, var(--leaf))',
  payment_pending: 'var(--info, var(--leaf))',
  active: 'var(--success)',
  rejected: 'var(--danger)',
};

export function RegistrationDetailSheet({
  regId,
  open,
  onClose,
  onChanged,
}: {
  regId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [reg, setReg] = useState<Registration | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (id: string) => {
    setError(null);
    const r = await api.getRegistration(id);
    setReg(r.registration);
  }, []);

  useEffect(() => {
    if (!open || !regId) return;
    let active = true;
    setReg(null);
    reload(regId).catch((e) => active && setError(e instanceof Error ? e.message : 'Could not load registration'));
    return () => { active = false; };
  }, [open, regId, reload]);

  return (
    <Sheet open={open} title={reg?.login_id || t('admin.reg.title')} onClose={onClose}>
      {error ? (
        <div className="p-6 text-center text-sm text-danger">{error}</div>
      ) : !reg ? (
        <Spinner />
      ) : (
        <Body reg={reg} onDone={() => { onChanged(); onClose(); }} onChanged={() => { onChanged(); if (regId) void reload(regId); }} />
      )}
    </Sheet>
  );
}

function Body({ reg, onDone, onChanged }: { reg: Registration; onDone: () => void; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const status = String(reg.approval_status || 'pending_review');
  const fullName = `${reg.fname || ''} ${reg.lname || ''}`.trim() || '—';
  const address = buildAddress(reg);

  async function run(fn: () => Promise<{ message: string }>, close: boolean) {
    setBusy(true);
    try {
      const res = await fn();
      toast(res.message || t('admin.reg.done'), 'ok');
      if (close) onDone(); else onChanged();
      setShowReject(false);
      setReason('');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-pill px-3 py-1 text-xs font-bold text-white" style={{ background: REG_STATUS_TONE[status] || 'var(--fg-muted)' }}>
          {t('admin.reg.status.' + status, status)}
        </span>
        {reg.seller_type ? <span className="text-2xs uppercase tracking-wide text-fg-muted">{String(reg.seller_type)}</span> : null}
      </div>

      {/* Action controls, gated by workflow state */}
      {status === 'pending_review' ? (
        <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
          <p className="text-2xs text-fg-muted">{t('admin.reg.approveHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => api.approveRegistration(reg.id), true)} disabled={busy}>{t('admin.reg.approve')}</Button>
            <Button variant="danger" onClick={() => setShowReject(true)} disabled={busy}>{t('admin.reg.reject')}</Button>
          </div>
        </section>
      ) : null}

      {status === 'payment_pending' ? (
        <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
          <p className="text-2xs text-fg-muted">{t('admin.reg.confirmHint')}</p>
          {reg.payment_reference ? <Row label={t('admin.reg.paymentRef')} value={String(reg.payment_reference)} mono /> : null}
          <div>
            <Button onClick={() => run(() => api.confirmRegistrationPayment(reg.id), true)} disabled={busy}>{t('admin.reg.confirmPayment')}</Button>
          </div>
        </section>
      ) : null}

      {status === 'rejected' && reg.rejection_reason ? (
        <section className="rounded-base border border-danger/40 bg-surface-muted p-3">
          <span className="text-2xs uppercase tracking-wide text-danger">{t('admin.reg.rejectionReason')}</span>
          <p className="mt-1 text-sm text-fg">{String(reg.rejection_reason)}</p>
        </section>
      ) : null}

      <Section title={`👤 ${t('admin.reg.applicant')}`}>
        <Row label={t('admin.reg.name')} value={fullName} />
        <Row label={t('admin.reg.loginId')} value={reg.login_id || '—'} mono />
        <Row label={t('admin.reg.phone')} value={`${(reg.country_code as string) || '+91'} ${reg.phone}`} mono />
        {reg.email ? <Row label={t('admin.reg.email')} value={String(reg.email)} /> : null}
        {reg.district ? <Row label={t('admin.reg.district')} value={String(reg.district)} /> : null}
        {reg.state ? <Row label={t('admin.reg.state')} value={String(reg.state)} /> : null}
        {address ? <div className="pt-1.5 text-2xs text-fg-muted">{address}</div> : null}
        <Row label={t('admin.reg.appliedOn')} value={fmtDateShort(reg.created_at as string)} />
      </Section>

      {(reg.business_name || reg.gst_number || reg.bank_name) ? (
        <Section title={`🏦 ${t('admin.reg.business')}`}>
          {reg.business_name ? <Row label={t('admin.reg.businessName')} value={String(reg.business_name)} /> : null}
          {reg.business_type ? <Row label={t('admin.reg.businessType')} value={String(reg.business_type)} /> : null}
          {reg.gst_number ? <Row label={t('admin.reg.gst')} value={String(reg.gst_number)} mono /> : null}
          {reg.bank_name ? <Row label={t('admin.reg.bank')} value={String(reg.bank_name)} /> : null}
          {reg.bank_account ? <Row label={t('admin.reg.account')} value={String(reg.bank_account)} mono /> : null}
          {reg.ifsc ? <Row label={t('admin.reg.ifsc')} value={String(reg.ifsc)} mono /> : null}
        </Section>
      ) : null}

      {reg.subscription_plan || reg.payment_confirmed_at ? (
        <Section title={`📅 ${t('admin.reg.subscription')}`}>
          {reg.subscription_plan ? <Row label={t('admin.reg.plan')} value={String(reg.subscription_plan)} /> : null}
          {reg.subscription_expires_at ? <Row label={t('admin.reg.expires')} value={fmtDate(String(reg.subscription_expires_at))} /> : null}
          {reg.payment_confirmed_at ? <Row label={t('admin.reg.paidOn')} value={fmtDate(String(reg.payment_confirmed_at))} /> : null}
        </Section>
      ) : null}

      <Modal
        open={showReject}
        title={t('admin.reg.rejectConfirm')}
        subtitle={fullName}
        onClose={() => setShowReject(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReject(false)} disabled={busy}>{t('admin.reg.cancel')}</Button>
            <Button variant="danger" onClick={() => run(() => api.rejectRegistration(reg.id, reason), true)} disabled={busy || !reason.trim()}>
              {busy ? '…' : t('admin.reg.reject')}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.reg.rejectReason')}</label>
        <textarea className={INPUT_CLASS} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.reg.rejectReasonPlaceholder')} />
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

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={`text-sm font-semibold text-fg ${mono ? 'tabular-nums' : ''}`}>{value}</span>
    </div>
  );
}
