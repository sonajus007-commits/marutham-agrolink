import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, INPUT_CLASS, Modal, Sheet, Spinner } from '@marutham/ui';
import { api, type Employee, type EmployeeAuditEntry } from '@marutham/api-client';
import { fmtDate, fmtDateShort } from '@marutham/lib';
import { useToast } from '../../components/Toast';

export const EMP_APPROVAL_TONE: Record<string, string> = {
  pending: 'var(--warning-strong)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

const maskAadhar = (a?: unknown) => {
  const s = a ? String(a) : '';
  return s.length >= 4 ? '•••• •••• ' + s.slice(-4) : (s || '—');
};

export function EmployeeDetailSheet({
  employeeId,
  open,
  canApprove,
  onClose,
  onChanged,
}: {
  employeeId: string | null;
  open: boolean;
  canApprove: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [emp, setEmp] = useState<Employee | null>(null);
  const [history, setHistory] = useState<EmployeeAuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (id: string) => {
    setError(null);
    const [e, h] = await Promise.all([
      api.getEmployee(id),
      api.getEmployeeHistory(id).catch(() => ({ audit: [] })),
    ]);
    setEmp(e.employee);
    setHistory(h.audit || []);
  }, []);

  useEffect(() => {
    if (!open || !employeeId) return;
    let active = true;
    setEmp(null);
    setHistory([]);
    reload(employeeId).catch((err) => active && setError(err instanceof Error ? err.message : 'Could not load employee'));
    return () => { active = false; };
  }, [open, employeeId, reload]);

  return (
    <Sheet open={open} title={emp?.emp_id || t('admin.emp.title')} onClose={onClose}>
      {error ? (
        <div className="p-6 text-center text-sm text-danger">{error}</div>
      ) : !emp ? (
        <Spinner />
      ) : (
        <Body emp={emp} history={history} canApprove={canApprove} onDone={() => { onChanged(); onClose(); }} />
      )}
    </Sheet>
  );
}

function Body({ emp, history, canApprove, onDone }: { emp: Employee; history: EmployeeAuditEntry[]; canApprove: boolean; onDone: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState('');

  const status = String(emp.approval_status || 'pending');
  const name = `${emp.fname || ''} ${emp.lname || ''}`.trim() || '—';
  const mgr = emp.reporting_manager
    ? `${emp.reporting_manager}${emp.reporting_manager_emp_id ? ` (${emp.reporting_manager_emp_id})` : ''}`
    : null;

  async function run(fn: () => Promise<{ message: string }>) {
    setBusy(true);
    try {
      const res = await fn();
      toast(res.message || t('admin.emp.done'), 'ok');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-pill px-3 py-1 text-xs font-bold text-white" style={{ background: EMP_APPROVAL_TONE[status] || 'var(--fg-muted)' }}>
          {t('admin.emp.approval.' + status, status)}
        </span>
        {emp.status ? <span className="text-2xs uppercase tracking-wide text-fg-muted">{String(emp.status)}</span> : null}
        {emp.is_manager ? <Tag label={t('admin.emp.mgr')} bg="var(--info)" /> : null}
        {emp.is_board_director ? <Tag label={t('admin.emp.bod')} bg="var(--warning-strong)" /> : null}
        {emp.is_hr_admin ? <Tag label={t('admin.emp.hr')} bg="var(--info)" /> : null}
      </div>

      {status === 'pending' && canApprove ? (
        <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
          <p className="text-2xs text-fg-muted">{t('admin.emp.approveHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => api.approveEmployee(emp.id!))} disabled={busy}>{t('admin.emp.approve')}</Button>
            <Button variant="danger" onClick={() => setShowReject(true)} disabled={busy}>{t('admin.emp.reject')}</Button>
          </div>
        </section>
      ) : null}

      {status === 'rejected' && emp.rejected_reason ? (
        <section className="rounded-base border border-danger/40 bg-surface-muted p-3">
          <span className="text-2xs uppercase tracking-wide text-danger">{t('admin.emp.rejectionReason')}</span>
          <p className="mt-1 text-sm text-fg">{String(emp.rejected_reason)}</p>
        </section>
      ) : null}

      <Section title={`👤 ${t('admin.emp.identity')}`}>
        <Row label={t('admin.emp.name')} value={name} />
        {emp.emp_id ? <Row label={t('admin.emp.empId')} value={String(emp.emp_id)} mono /> : null}
        {emp.gender ? <Row label={t('admin.emp.gender')} value={String(emp.gender)} /> : null}
        {emp.phone ? <Row label={t('admin.emp.phone')} value={String(emp.phone)} mono /> : null}
        {emp.email ? <Row label={t('admin.emp.email')} value={String(emp.email)} /> : null}
        {emp.aadhar ? <Row label={t('admin.emp.aadhar')} value={maskAadhar(emp.aadhar)} mono /> : null}
      </Section>

      <Section title={`💼 ${t('admin.emp.employment')}`}>
        {emp.designation ? <Row label={t('admin.emp.designation')} value={String(emp.designation)} /> : null}
        {emp.department ? <Row label={t('admin.emp.department')} value={String(emp.department)} /> : null}
        {emp.employment_type ? <Row label={t('admin.emp.type')} value={String(emp.employment_type)} /> : null}
        {emp.date_of_joining ? <Row label={t('admin.emp.doj')} value={fmtDateShort(emp.date_of_joining)} /> : null}
        {emp.work_location ? <Row label={t('admin.emp.workLocation')} value={String(emp.work_location)} /> : null}
        {emp.work_district ? <Row label={t('admin.emp.workDistrict')} value={String(emp.work_district)} /> : null}
        {emp.work_state ? <Row label={t('admin.emp.workState')} value={String(emp.work_state)} /> : null}
        {mgr ? <Row label={t('admin.emp.reportsTo')} value={mgr} /> : null}
      </Section>

      <Section title={`🔑 ${t('admin.emp.roles')}`}>
        <Row label={t('admin.emp.mgr')} value={emp.is_manager ? t('admin.emp.yes') : t('admin.emp.no')} />
        <Row label={t('admin.emp.bod')} value={emp.is_board_director ? t('admin.emp.yes') : t('admin.emp.no')} />
        <Row label={t('admin.emp.hr')} value={emp.is_hr_admin ? t('admin.emp.yes') : t('admin.emp.no')} />
        {emp.approved_at ? <Row label={t('admin.emp.approvedOn')} value={fmtDate(emp.approved_at)} /> : null}
      </Section>

      <Section title={`📍 ${t('admin.emp.history')}`}>
        {history.length === 0 ? (
          <p className="text-2xs text-fg-muted">{t('admin.emp.noHistory')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.map((h) => (
              <li key={h.id} className="border-b border-border-subtle pb-2 text-2xs last:border-b-0">
                <span className="font-semibold text-fg">{h.action}</span>
                <span className="text-fg-muted"> · {fmtDate(h.changed_at)}</span>
                {h.changed_fields && h.changed_fields.length ? (
                  <div className="text-fg-muted">{h.changed_fields.join(', ')}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Modal
        open={showReject}
        title={t('admin.emp.rejectConfirm')}
        subtitle={name}
        onClose={() => setShowReject(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReject(false)} disabled={busy}>{t('admin.emp.cancel')}</Button>
            <Button variant="danger" onClick={() => run(() => api.rejectEmployee(emp.id!, reason))} disabled={busy}>
              {busy ? '…' : t('admin.emp.reject')}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">{t('admin.emp.rejectReason')}</label>
        <textarea className={INPUT_CLASS} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('admin.emp.rejectReasonPlaceholder')} />
      </Modal>
    </div>
  );
}

function Tag({ label, bg }: { label: string; bg: string }) {
  return <span className="rounded-pill px-2 py-0.5 text-2xs font-bold text-white" style={{ background: bg }}>{label}</span>;
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
