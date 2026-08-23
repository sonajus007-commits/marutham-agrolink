import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, INPUT_CLASS, Modal, Select, Sheet, Spinner, Tabs } from '@marutham/ui';
import {
  api,
  type AccountStatus,
  type Hub,
  type LoginHistoryEntry,
  type User,
  type UserAuditEntry,
  type UserStatusHistoryEntry,
} from '@marutham/api-client';
import { addressDetailRows, buildAddress, fmtDate } from '@marutham/lib';
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
  const { user: me } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [reason, setReason] = useState('');
  const [canDeliver, setCanDeliver] = useState(!!user.can_deliver);
  useEffect(() => setCanDeliver(!!user.can_deliver), [user.can_deliver]);

  const status = String(user.status);
  const roleLabel = user.role === 'admin' ? String(user.admin_role || 'Admin') : String(user.role);
  const isSeller = user.role === 'farmer';
  const isVCO = user.role === 'admin' && user.admin_role === 'VCO';
  // The hub-based field roles: their office is a hub, set here by admin/HR.
  const HUB_ROLES = ['VCO', 'Delivery Agent', 'Hub Incharge', 'Hub Manager'];
  const isHubRole = user.role === 'admin' && HUB_ROLES.includes(String(user.admin_role));
  const canEditUsers = ((me?.permissions?.user_management?.actions as string[]) || []).includes(
    'edit',
  );

  async function saveCanDeliver(next: boolean) {
    setCanDeliver(next); // optimistic
    setBusy(true);
    try {
      await api.adminUpdateUser(user.id, { can_deliver: next });
      toast(t('admin.users.saved', 'Saved.'), 'ok');
      onChanged();
    } catch (e) {
      setCanDeliver(!next); // revert on failure
      toast(e instanceof Error ? e.message : 'Could not save', 'er');
    } finally {
      setBusy(false);
    }
  }

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

      {isVCO ? (
        <Section title={`🛵 ${t('admin.users.deliveryCap', 'Delivery Capability')}`}>
          <label className="flex items-center gap-2 py-1 text-sm text-fg">
            <input
              type="checkbox"
              checked={canDeliver}
              disabled={busy || !canEditUsers}
              onChange={(e) => saveCanDeliver(e.target.checked)}
            />
            {t('admin.users.canDeliver', 'Also serves as a nearby Delivery Agent')}
          </label>
          <p className="mt-1 text-2xs text-fg-muted">
            {t(
              'admin.users.canDeliverHint',
              'Lets this VCO be assigned last-mile deliveries within their own service area, on top of collections. Their role and permissions are unchanged otherwise.',
            )}
          </p>
        </Section>
      ) : null}

      {isHubRole ? (
        <HubAssignSection user={user} canEdit={canEditUsers} onChanged={onChanged} />
      ) : null}

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
  const { t, i18n } = useTranslation();
  const { user: me } = useAuth();
  const privileged = canSeeAudit(me);

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
            <span className="text-fg-muted"> · {fmtDate(h.created_at, i18n.language)}</span>
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

/* Assign a VCO / Delivery Agent / Hub Incharge / Hub Manager to their home hub.
 * Admin/HR own this; the staff member sees it read-only on their own profile, and
 * their office address IS the selected hub's address (shown below the picker so the
 * assigner sees exactly what the employee will see). Hubs are drawn from the user's
 * own district — the network the person actually works in. */
function HubAssignSection({
  user,
  canEdit,
  onChanged,
}: {
  user: User;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const district = String(user.district || '');
  const state = user.state ? String(user.state) : undefined;
  const [hubs, setHubs] = useState<Hub[]>([]);
  const [hubId, setHubId] = useState<string>((user.hub_id as string) || '');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => setHubId((user.hub_id as string) || ''), [user.hub_id]);

  useEffect(() => {
    if (!district) return;
    let active = true;
    setLoading(true);
    api
      .getHubs(district, state)
      .then((res) => active && setHubs(res.hubs || []))
      .catch(() => active && setHubs([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [district, state]);

  async function save(next: string) {
    const prev = hubId;
    setHubId(next); // optimistic
    setBusy(true);
    try {
      await api.adminUpdateUser(user.id, { hub_id: next || null });
      toast(t('admin.users.saved', 'Saved.'), 'ok');
      onChanged();
    } catch (e) {
      setHubId(prev); // revert
      toast(e instanceof Error ? e.message : 'Could not save', 'er');
    } finally {
      setBusy(false);
    }
  }

  const selected = hubs.find((h) => h.id === hubId) || null;

  return (
    <Section title={`🏭 ${t('admin.users.hubAssign', 'Hub assignment')}`}>
      {!district ? (
        <p className="py-1 text-2xs text-fg-muted">
          {t('admin.users.hubNoDistrict', 'Set this staff member’s district to assign a hub.')}
        </p>
      ) : (
        <>
          <Select
            value={hubId}
            disabled={busy || loading || !canEdit}
            aria-label={t('admin.users.hub', 'Hub')}
            onChange={(e) => save(e.target.value)}
          >
            <option value="">{t('admin.users.hubUnassigned', '— No hub assigned —')}</option>
            {hubs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.taluk ? ` · ${h.taluk}` : ''}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-2xs text-fg-muted">
            {t(
              'admin.users.hubHint',
              'The office this person works from. Their profile shows this hub’s office address, and delivery routing uses it.',
            )}
          </p>
          {selected ? (
            <div className="mt-2 rounded-base border border-border-subtle bg-surface-muted p-2">
              <div className="mb-1 text-2xs font-bold uppercase tracking-wide text-fg-muted">
                {t('admin.users.officeAddress', 'Office address')}
              </div>
              {addressDetailRows(selected, '—').map(([key, label, value]) => (
                <div key={key} className="flex justify-between gap-3 py-0.5 text-2xs">
                  <span className="text-fg-muted">{t(key, label)}</span>
                  <span className="text-right font-medium text-fg">{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </>
      )}
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
