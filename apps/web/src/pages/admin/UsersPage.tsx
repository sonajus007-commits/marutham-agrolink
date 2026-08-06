import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type User } from '@marutham/api-client';
import { fmtDateShort, adminRoleKey, userRoleKey, userStatusKey } from '@marutham/lib';
import { UserDetailSheet, USER_STATUS_TONE } from './UserDetailSheet';
import { useTableLabels } from './useTableLabels';

const kindOf = (u: User) => (u.role === 'admin' ? 'admin' : u.role);
/* The stored value, for the filter/sort/CSV. Spoken at the render site. */
const roleValue = (u: User) =>
  u.role === 'admin' ? String(u.admin_role || 'Admin') : String(u.role);
const roleKeyOf = (u: User) =>
  u.role === 'admin' ? adminRoleKey(roleValue(u)) : userRoleKey(roleValue(u));

export function UsersPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Honour a ?kind= deep link (the Overview KPI tiles land here pre-filtered).
  // An unknown value falls back to 'all'; the chips still drive it from then on.
  const [searchParams] = useSearchParams();
  const initialKind = searchParams.get('kind');
  const [kind, setKind] = useState(
    ['consumer', 'farmer', 'admin'].includes(initialKind || '') ? (initialKind as string) : 'all',
  );
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getUsers();
      setUsers(res.users || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kindOptions = useMemo(() => {
    const counts = { consumer: 0, farmer: 0, admin: 0 } as Record<string, number>;
    users.forEach((u) => {
      counts[kindOf(u)] = (counts[kindOf(u)] || 0) + 1;
    });
    return [
      { value: 'all', label: `${t('admin.users.all')} (${users.length})` },
      { value: 'consumer', label: `${t('admin.users.consumers')} (${counts.consumer})` },
      { value: 'farmer', label: `${t('admin.users.farmers')} (${counts.farmer})` },
      { value: 'admin', label: `${t('admin.users.staff')} (${counts.admin})` },
    ];
  }, [users, t]);

  const rows = useMemo(
    () => (kind === 'all' ? users : users.filter((u) => kindOf(u) === kind)),
    [users, kind],
  );

  const columns = useMemo<TableColumn<User>[]>(
    () => [
      {
        key: 'login_id',
        header: t('admin.users.loginId'),
        value: (u) => u.login_id || '',
        width: '150px',
      },
      {
        key: 'name',
        header: t('admin.users.name'),
        value: (u) => `${u.fname || ''} ${u.lname || ''}`.trim(),
      },
      {
        key: 'role',
        header: t('admin.users.role'),
        value: (u) => roleValue(u),
        render: (u) => t(roleKeyOf(u), roleValue(u)),
      },
      {
        key: 'district',
        header: t('admin.users.district'),
        value: (u) => (u.district as string) || '',
      },
      {
        key: 'status',
        header: t('admin.users.status'),
        value: (u) => String(u.status),
        render: (u) => (
          <span
            className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
            style={{ background: USER_STATUS_TONE[String(u.status)] || 'var(--fg-muted)' }}
          >
            {t(userStatusKey(String(u.status)), String(u.status))}
          </span>
        ),
      },
      { key: 'phone', header: t('admin.users.phone'), value: (u) => u.phone || '' },
      {
        key: 'joined',
        header: t('admin.users.joined'),
        value: (u) => (u.created_at as string) || '',
        render: (u) => fmtDateShort(u.created_at as string, i18n.language),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (u) => (
          <button
            type="button"
            onClick={() => setOpenId(u.id)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {t('admin.users.view')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (loading && users.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.users.title')}</h1>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.users.refresh')}
        </Button>
      </div>

      <div className="mb-3">
        <FilterChips options={kindOptions} value={kind} onChange={setKind} />
      </div>

      <Table
        labels={tableLabels}
        rows={rows}
        columns={columns}
        rowId={(u) => u.id}
        rowLabel={(u) => u.login_id || u.id}
        caption={t('admin.users.title')}
        searchable
        searchPlaceholder={t('admin.users.search')}
        exportFileName="users.csv"
        pageSize={25}
        empty={<EmptyState icon="👥">{t('admin.users.empty')}</EmptyState>}
      />

      <UserDetailSheet
        userId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </>
  );
}
