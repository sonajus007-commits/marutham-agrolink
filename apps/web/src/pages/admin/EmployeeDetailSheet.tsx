import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, INPUT_CLASS, Modal, Sheet, Spinner } from '@marutham/ui';
import { api, type Employee, type EmployeeAuditEntry } from '@marutham/api-client';
import { fmtDate, fmtDateShort } from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { AuditLogList } from './HistoryPanels';
import { BAND_LABEL } from './employeeOptions';

export const EMP_APPROVAL_TONE: Record<string, string> = {
  pending: 'var(--warning-strong)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

const maskAadhar = (a?: unknown) => {
  const s = a ? String(a) : '';
  return s.length >= 4 ? '•••• •••• ' + s.slice(-4) : s || '—';
};

export function EmployeeDetailSheet({
  employeeId,
  open,
  canApprove,
  canManage,
  selfEmpId,
  onClose,
  onChanged,
  onEdit,
}: {
  employeeId: string | null;
  open: boolean;
  canApprove: boolean;
  canManage: boolean;
  /** The viewer's own Employee ID. Removing yourself revokes your own login mid-request
   *  and locks you out of the console that would undo it — the server refuses, and the
   *  button should not be there to press. */
  selfEmpId?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (emp: Employee) => void;
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
    reload(employeeId).catch(
      (err) => active && setError(err instanceof Error ? err.message : 'Could not load employee'),
    );
    return () => {
      active = false;
    };
  }, [open, employeeId, reload]);

  return (
    <Sheet open={open} title={emp?.emp_id || t('admin.emp.title')} onClose={onClose}>
      {error ? (
        <div className="p-6 text-center text-sm text-danger">{error}</div>
      ) : !emp ? (
        <Spinner />
      ) : (
        <Body
          emp={emp}
          history={history}
          canApprove={canApprove}
          canManage={canManage}
          selfEmpId={selfEmpId}
          onDone={() => {
            onChanged();
            onClose();
          }}
          onEdit={onEdit}
        />
      )}
    </Sheet>
  );
}

function Body({
  emp,
  history,
  canApprove,
  canManage,
  selfEmpId,
  onDone,
  onEdit,
}: {
  emp: Employee;
  history: EmployeeAuditEntry[];
  canApprove: boolean;
  canManage: boolean;
  selfEmpId?: string | null;
  onDone: () => void;
  onEdit: (emp: Employee) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showRemove, setShowRemove] = useState(false);
  const [reason, setReason] = useState('');
  // Whether a login actually exists, resolved when the confirm opens rather than
  // guessed from the Employee ID — having an ID does NOT mean a login was ever created.
  // undefined = not known yet (or the lookup failed), and the copy stays generic.
  const [hasLogin, setHasLogin] = useState<boolean | undefined>(undefined);

  // The staff login bound to this Employee ID: a string when one exists, null when the
  // employee has none yet, undefined while the lookup is in flight. Resolved on open —
  // an Employee ID does NOT imply a login, which is exactly what trips admins up.
  const [loginId, setLoginId] = useState<string | null | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  useEffect(() => {
    let active = true;
    if (!emp.emp_id) {
      setLoginId(null);
      return;
    }
    setLoginId(undefined);
    api
      .lookupEmployee(String(emp.emp_id))
      .then((r) => active && setLoginId(r.existing_login_id))
      .catch(() => active && setLoginId(undefined));
    return () => {
      active = false;
    };
  }, [emp.emp_id]);

  const status = String(emp.approval_status || 'pending');
  // A removed employee is read-only: no edit, no approve, no reject. The server 404s
  // all three, so offering them would only produce a confusing error.
  const removed = !!emp.deleted_at;
  const isSelf = !!emp.emp_id && !!selfEmpId && emp.emp_id === selfEmpId;
  const name = `${emp.fname || ''} ${emp.lname || ''}`.trim() || '—';
  const mgr = emp.reporting_manager
    ? `${emp.reporting_manager}${emp.reporting_manager_emp_id ? ` (${emp.reporting_manager_emp_id})` : ''}`
    : null;

  /** Open the confirm, and find out whether there is actually a login to revoke. An
   *  employee with no Employee ID can never have one (a login is bound to the ID), so
   *  that case is settled without asking. A failed lookup is not an error worth
   *  blocking on — the confirm just falls back to the generic wording. */
  function openRemove() {
    setShowRemove(true);
    if (!emp.emp_id) {
      setHasLogin(false);
      return;
    }
    setHasLogin(undefined);
    api
      .lookupEmployee(String(emp.emp_id))
      .then((r) => setHasLogin(!!r.existing_login_id))
      .catch(() => setHasLogin(undefined));
  }

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

  // Provision the login for this employee. Unlike run(), this deliberately does NOT
  // close the sheet — the admin needs to see the new login ID (and the temporary
  // password they just set) to hand it over. The profile fields ride off the employee
  // master; the server derives the login role from the designation.
  async function createLogin() {
    if (pw.length < 6) {
      toast(t('admin.emp.login.pwShort', 'Password must be at least 6 characters.'), 'er');
      return;
    }
    if (pw !== pw2) {
      toast(t('admin.emp.login.pwMismatch', 'Passwords do not match.'), 'er');
      return;
    }
    const str = (v: unknown) => (v ? String(v) : undefined);
    setBusy(true);
    try {
      const res = await api.createStaff({
        emp_id: String(emp.emp_id),
        fname: String(emp.fname || ''),
        lname: str(emp.lname),
        phone: String(emp.phone || ''),
        password: pw,
        gender: str(emp.gender),
        state: str(emp.state),
        district: str(emp.district),
        taluk: str(emp.taluk),
        city: str(emp.city),
        pincode: str(emp.pincode),
        aadhar: str(emp.aadhar),
        village_town: str(emp.village_town),
      });
      toast(t('admin.emp.login.created', 'Login created: {{id}}', { id: res.login_id }), 'ok');
      setLoginId(res.login_id);
      setShowCreate(false);
      setPw('');
      setPw2('');
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.emp.login.failed', 'Could not create login'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  // A login can be provisioned only for an approved, active, non-removed employee that
  // does not already have one. The server re-checks all of this (and whether the
  // caller's role may create this designation), so this is UX, not the guard.
  const canCreateLogin =
    canManage &&
    !removed &&
    status === 'approved' &&
    String(emp.status) === 'active' &&
    !!emp.emp_id &&
    loginId === null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-pill px-3 py-1 text-xs font-bold text-white"
          style={{ background: EMP_APPROVAL_TONE[status] || 'var(--fg-muted)' }}
        >
          {t('admin.emp.approval.' + status, status)}
        </span>
        {emp.status ? (
          <span className="text-2xs uppercase tracking-wide text-fg-muted">
            {String(emp.status)}
          </span>
        ) : null}
        {emp.is_manager ? <Tag label={t('admin.emp.mgr')} bg="var(--info)" /> : null}
        {emp.is_board_director ? (
          <Tag label={t('admin.emp.bod')} bg="var(--warning-strong)" />
        ) : null}
        {emp.is_hr_admin ? <Tag label={t('admin.emp.hr')} bg="var(--info)" /> : null}
        {removed ? <Tag label={t('admin.emp.removed')} bg="var(--danger)" /> : null}
        {canManage && !removed ? (
          <Button variant="ghost" onClick={() => onEdit(emp)} className="ml-auto">
            {t('admin.emp.edit')}
          </Button>
        ) : null}
      </div>

      {removed ? (
        <section className="flex flex-col gap-2 rounded-base border border-danger/40 bg-surface-muted p-3">
          <div>
            <p className="text-sm font-bold text-danger">{t('admin.emp.removedBanner')}</p>
            <p className="mt-0.5 text-2xs text-fg-muted">
              {t('admin.emp.removedOn')}: {fmtDate(emp.deleted_at, i18n.language)}
            </p>
          </div>
          {canApprove ? (
            <>
              <p className="text-2xs text-fg-muted">{t('admin.emp.restoreHint')}</p>
              <div>
                <Button onClick={() => run(() => api.restoreEmployee(emp.id!))} disabled={busy}>
                  {busy ? t('admin.emp.restoring') : t('admin.emp.restore')}
                </Button>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {status === 'pending' && canApprove && !removed ? (
        <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
          <p className="text-2xs text-fg-muted">{t('admin.emp.approveHint')}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => run(() => api.approveEmployee(emp.id!))} disabled={busy}>
              {t('admin.emp.approve')}
            </Button>
            <Button variant="danger" onClick={() => setShowReject(true)} disabled={busy}>
              {t('admin.emp.reject')}
            </Button>
          </div>
        </section>
      ) : null}

      {status === 'rejected' && emp.rejected_reason ? (
        <section className="rounded-base border border-danger/40 bg-surface-muted p-3">
          <span className="text-2xs uppercase tracking-wide text-danger">
            {t('admin.emp.rejectionReason')}
          </span>
          <p className="mt-1 text-sm text-fg">{String(emp.rejected_reason)}</p>
        </section>
      ) : null}

      <Section title={`👤 ${t('admin.emp.identity')}`}>
        <Row label={t('admin.emp.name')} value={name} />
        {emp.emp_id ? <Row label={t('admin.emp.empId')} value={String(emp.emp_id)} mono /> : null}
        {emp.gender ? <Row label={t('admin.emp.gender')} value={String(emp.gender)} /> : null}
        {emp.phone ? <Row label={t('admin.emp.phone')} value={String(emp.phone)} mono /> : null}
        {emp.email ? <Row label={t('admin.emp.email')} value={String(emp.email)} /> : null}
        {emp.aadhar ? (
          <Row label={t('admin.emp.aadhar')} value={maskAadhar(emp.aadhar)} mono />
        ) : null}
      </Section>

      <Section title={`💼 ${t('admin.emp.employment')}`}>
        {emp.designation ? (
          <Row label={t('admin.emp.designation')} value={String(emp.designation)} />
        ) : null}
        {emp.department ? (
          <Row label={t('admin.emp.department')} value={String(emp.department)} />
        ) : null}
        {emp.career_band ? (
          <Row
            label={t('admin.emp.band')}
            value={`${emp.career_band}${
              BAND_LABEL[String(emp.career_band)] ? ` · ${BAND_LABEL[String(emp.career_band)]}` : ''
            }`}
          />
        ) : null}
        {emp.employment_type ? (
          <Row label={t('admin.emp.type')} value={String(emp.employment_type)} />
        ) : null}
        {emp.date_of_joining ? (
          <Row
            label={t('admin.emp.doj')}
            value={fmtDateShort(emp.date_of_joining, i18n.language)}
          />
        ) : null}
        {emp.work_location ? (
          <Row label={t('admin.emp.workLocation')} value={String(emp.work_location)} />
        ) : null}
        {emp.work_district ? (
          <Row label={t('admin.emp.workDistrict')} value={String(emp.work_district)} />
        ) : null}
        {emp.work_state ? (
          <Row label={t('admin.emp.workState')} value={String(emp.work_state)} />
        ) : null}
        {mgr ? <Row label={t('admin.emp.reportsTo')} value={mgr} /> : null}
      </Section>

      <Section title={`🔑 ${t('admin.emp.roles')}`}>
        <Row
          label={t('admin.emp.mgr')}
          value={emp.is_manager ? t('admin.emp.yes') : t('admin.emp.no')}
        />
        <Row
          label={t('admin.emp.bod')}
          value={emp.is_board_director ? t('admin.emp.yes') : t('admin.emp.no')}
        />
        <Row
          label={t('admin.emp.hr')}
          value={emp.is_hr_admin ? t('admin.emp.yes') : t('admin.emp.no')}
        />
        {emp.approved_at ? (
          <Row label={t('admin.emp.approvedOn')} value={fmtDate(emp.approved_at, i18n.language)} />
        ) : null}
      </Section>

      {/* Login account — an approved employee still needs a login provisioned before
          they can sign in (by password OR OTP). This section makes that state visible
          and lets an authorised admin create it, instead of the silent gap that made
          "active in the tracker" look like "able to log in". */}
      <Section title={`🔐 ${t('admin.emp.login.title', 'Login Account')}`}>
        {loginId === undefined ? (
          <p className="py-1.5 text-sm text-fg-muted">
            {t('admin.emp.login.checking', 'Checking…')}
          </p>
        ) : loginId ? (
          <>
            <Row label={t('admin.emp.login.id', 'Login ID')} value={loginId} mono />
            <p className="pt-1.5 text-2xs text-success">
              {t('admin.emp.login.can', 'This employee can sign in with password or OTP.')}
            </p>
          </>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-fg-muted">
              {t('admin.emp.login.none', 'No login account yet — this employee cannot sign in.')}
            </p>
            {canCreateLogin ? (
              <Button onClick={() => setShowCreate(true)} disabled={busy}>
                {t('admin.emp.login.create', 'Create Login')}
              </Button>
            ) : !removed && (status !== 'approved' || String(emp.status) !== 'active') ? (
              <p className="text-2xs text-fg-muted">
                {t('admin.emp.login.needApproved', 'Approve & activate the employee first.')}
              </p>
            ) : null}
          </div>
        )}
      </Section>

      {/* Was hand-rolled here and rendered every diff blank: the trigger writes
          changed_fields as an object, not the string[] this sheet assumed. Same
          renderer as the user audit trail now. */}
      <Section title={`📍 ${t('admin.emp.history')}`}>
        <AuditLogList rows={history} loading={false} emptyText={t('admin.emp.noHistory')} />
      </Section>

      {canApprove && !removed ? (
        <section className="flex flex-wrap items-center justify-between gap-2 rounded-base border border-danger/40 p-3">
          <p className="text-2xs text-fg-muted">
            {isSelf ? t('admin.emp.selfRemoveHint') : t('admin.emp.removeKeepsRecord')}
          </p>
          <Button variant="danger" onClick={() => openRemove()} disabled={busy || isSelf}>
            {t('admin.emp.remove')}
          </Button>
        </section>
      ) : null}

      <Modal
        open={showRemove}
        title={t('admin.emp.removeConfirm')}
        subtitle={name}
        onClose={() => setShowRemove(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowRemove(false)} disabled={busy}>
              {t('admin.emp.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => run(() => api.removeEmployee(emp.id!))}
              disabled={busy}
            >
              {busy ? t('admin.emp.removing') : t('admin.emp.remove')}
            </Button>
          </>
        }
      >
        {/* Both halves, stated plainly. A confirm that says only "are you sure?" leaves
            the person guessing at the two things they actually need to know: the login
            dies now, and the record does not die at all. */}
        <p className="text-sm text-fg">
          {hasLogin === false ? t('admin.emp.removeNoLogin') : t('admin.emp.removeLoginWarning')}
        </p>
        <p className="mt-2 text-2xs text-fg-muted">{t('admin.emp.removeKeepsRecord')}</p>
      </Modal>

      <Modal
        open={showReject}
        title={t('admin.emp.rejectConfirm')}
        subtitle={name}
        onClose={() => setShowReject(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowReject(false)} disabled={busy}>
              {t('admin.emp.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => run(() => api.rejectEmployee(emp.id!, reason))}
              disabled={busy}
            >
              {busy ? '…' : t('admin.emp.reject')}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
          {t('admin.emp.rejectReason')}
        </label>
        <textarea
          className={INPUT_CLASS}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin.emp.rejectReasonPlaceholder')}
        />
      </Modal>

      <Modal
        open={showCreate}
        title={t('admin.emp.login.create', 'Create Login')}
        subtitle={`${name}${emp.emp_id ? ` · ${emp.emp_id}` : ''}`}
        onClose={() => setShowCreate(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={busy}>
              {t('admin.emp.cancel')}
            </Button>
            <Button onClick={createLogin} disabled={busy}>
              {busy
                ? t('admin.emp.login.creating', 'Creating…')
                : t('admin.emp.login.create', 'Create Login')}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-2xs text-fg-muted">
          {t(
            'admin.emp.login.hint',
            'The login role is set from the designation ({{role}}). The sign-in phone is {{phone}}. Set an initial password to share — the employee can change it after first sign-in.',
            { role: String(emp.designation || '—'), phone: String(emp.phone || '—') },
          )}
        </p>
        <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
          {t('admin.emp.login.pw', 'Initial password')}
        </label>
        <input
          className={INPUT_CLASS}
          type="password"
          autoComplete="new-password"
          aria-label={t('admin.emp.login.pw', 'Initial password')}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder={t('admin.emp.login.pwPlaceholder', 'At least 6 characters')}
        />
        <label className="mb-1 mt-3 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
          {t('admin.emp.login.pwConfirm', 'Confirm password')}
        </label>
        <input
          className={INPUT_CLASS}
          type="password"
          autoComplete="new-password"
          aria-label={t('admin.emp.login.pwConfirm', 'Confirm password')}
          value={pw2}
          onChange={(e) => setPw2(e.target.value)}
        />
      </Modal>
    </div>
  );
}

function Tag({ label, bg }: { label: string; bg: string }) {
  return (
    <span
      className="rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
      style={{ background: bg }}
    >
      {label}
    </span>
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
