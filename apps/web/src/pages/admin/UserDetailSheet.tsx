import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, INPUT_CLASS, Modal, Sheet, Spinner, Tabs } from '@marutham/ui';
import {
  api,
  type AccountStatus,
  type LoginHistoryEntry,
  type User,
  type UserAuditEntry,
  type UserStatusHistoryEntry,
} from '@marutham/api-client';
import { buildAddress, fmtDate } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { AuditLogList, LoginHistoryList } from './HistoryPanels';
import { canSeeAudit } from './adminNav';

/** Account-status → semantic colour. Distinct from order statusColor. */
export const USER_STATUS_TONE: Record<string, string> = {
  active: 'var(--success)',
  suspended: 'var(--warning-strong)',
  blocked: 'var(--danger)',
};

export function UserDetailSheet({
  userId,
  open,
  onClose,
  onChanged,
}: {
  userId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<UserStatusHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (id: string) => {
    setError(null);
    const [u, h] = await Promise.all([
      api.getUser(id),
      api.getUserStatusHistory(id).catch(() => ({ history: [] })),
    ]);
    setUser(u.user);
    setHistory(h.history || []);
  }, []);

  useEffect(() => {
    if (!open || !userId) return;
    let active = true;
    setUser(null);
    setHistory([]);
    reload(userId).catch(
      (e) => active && setError(e instanceof Error ? e.message : 'Could not load user'),
    );
    return () => {
      active = false;
    };
  }, [open, userId, reload]);

  return (
    <Sheet open={open} title={user?.login_id || t('admin.users.title')} onClose={onClose}>
      {error ? (
        <div className="p-6 text-center text-sm text-danger">{error}</div>
      ) : !user ? (
        <Spinner />
      ) : (
        <Body
          user={user}
          history={history}
          onChanged={() => {
            onChanged();
            if (userId) void reload(userId);
          }}
        />
      )}
    </Sheet>
  );
}

function Body({
  user,
  history,
  onChanged,
}: {
  user: User;
  history: UserStatusHistoryEntry[];
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [reason, setReason] = useState('');

  const status = String(user.status);
  const roleLabel = user.role === 'admin' ? String(user.admin_role || 'Admin') : String(user.role);
  const isSeller = user.role === 'farmer';

  async function change(next: AccountStatus, why?: string) {
    setBusy(true);
    try {
      await api.setUserStatus(user.id, next, why);
      toast(t('admin.users.statusChanged', { status: next }), 'ok');
      setShowBlock(false);
      setReason('');
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not change status', 'er');
    } finally {
      setBusy(false);
    }
  }

  const fullName = `${user.fname || ''} ${user.lname || ''}`.trim() || '—';
  const address = buildAddress(user);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-pill px-3 py-1 text-xs font-bold text-white"
          style={{ background: USER_STATUS_TONE[status] || 'var(--fg-muted)' }}
        >
          {status}
        </span>
        <span className="text-2xs uppercase tracking-wide text-fg-muted">{roleLabel}</span>
      </div>

      {/* Status control */}
      <section className="flex flex-wrap gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
        {status !== 'active' ? (
          <Button onClick={() => change('active')} disabled={busy}>
            {t('admin.users.activate')}
          </Button>
        ) : null}
        {status === 'active' ? (
          <Button variant="ghost" onClick={() => change('suspended')} disabled={busy}>
            {t('admin.users.suspend')}
          </Button>
        ) : null}
        {status !== 'blocked' ? (
          <Button variant="danger" onClick={() => setShowBlock(true)} disabled={busy}>
            {t('admin.users.block')}
          </Button>
        ) : null}
      </section>

      <Section title={`👤 ${t('admin.users.identity')}`}>
        <Row label={t('admin.users.loginId')} value={user.login_id || '—'} mono />
        <Row label={t('admin.users.name')} value={fullName} />
        <Row label={t('admin.users.role')} value={roleLabel} />
        <Row
          label={t('admin.users.phone')}
          value={`${(user.country_code as string) || '+91'} ${user.phone}`}
          mono
        />
        {user.email ? <Row label={t('admin.users.email')} value={String(user.email)} /> : null}
        {user.district ? (
          <Row label={t('admin.users.district')} value={String(user.district)} />
        ) : null}
        {address ? <div className="pt-1.5 text-2xs text-fg-muted">{address}</div> : null}
      </Section>

      {isSeller ? (
        <Section title={`🏦 ${t('admin.users.seller')}`}>
          {user.seller_type ? (
            <Row label={t('admin.users.sellerType')} value={String(user.seller_type)} />
          ) : null}
          {user.business_name ? (
            <Row label={t('admin.users.business')} value={String(user.business_name)} />
          ) : null}
          {user.bank_name ? (
            <Row label={t('admin.users.bank')} value={String(user.bank_name)} />
          ) : null}
          {user.subscription_plan ? (
            <Row label={t('admin.users.plan')} value={String(user.subscription_plan)} />
          ) : null}
          {user.subscription_expires_at ? (
            <Row
              label={t('admin.users.subUntil')}
              value={fmtDate(String(user.subscription_expires_at))}
            />
          ) : null}
        </Section>
      ) : null}

      <HistorySection userId={user.id} status={history} />

      <Modal
        open={showBlock}
        title={t('admin.users.blockConfirm')}
        subtitle={user.login_id}
        onClose={() => setShowBlock(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowBlock(false)} disabled={busy}>
              {t('admin.users.cancel')}
            </Button>
            <Button
              variant="danger"
              onClick={() => change('blocked', reason)}
              disabled={busy || !reason.trim()}
            >
              {busy ? '…' : t('admin.users.block')}
            </Button>
          </>
        }
      >
        <label className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted">
          {t('admin.users.blockReason')}
        </label>
        <textarea
          className={INPUT_CLASS}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('admin.users.blockReasonPlaceholder')}
        />
      </Modal>
    </div>
  );
}

/* Three trails on one record: the status changes any admin may see, and — for
 * Head Office / State Head only — the full record-change audit and every login
 * attempt. The two privileged trails are fetched only when their tab is first
 * opened: they are per-user queries capped at 100 rows server-side, and opening
 * a user sheet should not pay for them.
 *
 * The backend 403s a scoped admin, so the tabs are not merely hidden — a
 * District Manager has no way to reach the data. */
function HistorySection({ userId, status }: { userId: string; status: UserStatusHistoryEntry[] }) {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const privileged = canSeeAudit(me?.admin_role);

  const [audit, setAudit] = useState<UserAuditEntry[]>([]);
  const [logins, setLogins] = useState<LoginHistoryEntry[]>([]);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});

  async function openTab(tab: string) {
    setError(null);
    if (!privileged || tab === 'status' || loaded[tab]) return;

    setLoading(tab);
    try {
      if (tab === 'profile') {
        setAudit((await api.getUserAuditLog(userId)).audit || []);
      } else {
        setLogins((await api.getUserLoginHistory(userId)).logins || []);
      }
      setLoaded((l) => ({ ...l, [tab]: true }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('admin.users.historyFailed'));
    } finally {
      setLoading(null);
    }
  }

  const statusPanel =
    status.length === 0 ? (
      <p className="py-2 text-2xs text-fg-muted">{t('admin.users.noHistory')}</p>
    ) : (
      <ul className="flex list-none flex-col gap-2 p-0">
        {status.map((h) => (
          <li key={h.id} className="border-b border-border-subtle pb-2 text-2xs last:border-b-0">
            <span className="font-semibold text-fg">
              {h.old_status} → {h.new_status}
            </span>
            <span className="text-fg-muted"> · {fmtDate(h.created_at)}</span>
            {h.changer ? (
              <span className="text-fg-muted"> · {h.changer.fname || h.changer.login_id}</span>
            ) : null}
            {h.reason ? <div className="text-fg-muted italic">“{h.reason}”</div> : null}
          </li>
        ))}
      </ul>
    );

  if (!privileged) {
    return <Section title={`📍 ${t('admin.users.statusHistory')}`}>{statusPanel}</Section>;
  }

  return (
    <Section title={`📍 ${t('admin.users.history')}`}>
      <Tabs
        aria-label={t('admin.users.history')}
        defaultValue="status"
        onValueChange={(v) => void openTab(v)}
        items={[
          { value: 'status', label: `🕘 ${t('admin.users.statusHistory')}`, content: statusPanel },
          {
            value: 'profile',
            label: `✏️ ${t('admin.users.profileChanges')}`,
            content: (
              <AuditLogList
                rows={audit}
                loading={loading === 'profile'}
                error={error}
                emptyText={t('admin.users.noAudit')}
              />
            ),
          },
          {
            value: 'logins',
            label: `🔐 ${t('admin.users.logins')}`,
            content: (
              <LoginHistoryList
                rows={logins}
                loading={loading === 'logins'}
                error={error}
                emptyText={t('admin.users.noLogins')}
              />
            ),
          },
        ]}
      />
    </Section>
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
