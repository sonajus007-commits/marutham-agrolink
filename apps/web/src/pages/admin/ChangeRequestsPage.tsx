import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type ProfileChangeRequest } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { ChangeRequestSheet, CR_STATUS_TONE, isRenewal } from './ChangeRequestSheet';

/* The server filters change requests by a single status and has no "all" mode,
 * so we fetch each status in parallel and merge — that gives live chip counts and
 * lets the Table search/filter/export across the full set client-side. */
const STATUSES = ['pending', 'payment_pending', 'approved', 'rejected'] as const;

export function ChangeRequestsPage() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<ProfileChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('pending');
  const [open, setOpen] = useState<ProfileChangeRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        STATUSES.map((s) => api.getChangeRequests(s).then((r) => r.requests || [])),
      );
      setRequests(results.flat());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load change requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    requests.forEach((r) => {
      const s = String(r.status);
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      ...STATUSES.map((s) => ({
        value: s,
        label: `${t('admin.cr.status.' + s)} (${counts[s] || 0})`,
      })),
      { value: 'all', label: `${t('admin.cr.all')} (${requests.length})` },
    ];
  }, [requests, t]);

  const rows = useMemo(
    () => (status === 'all' ? requests : requests.filter((r) => String(r.status) === status)),
    [requests, status],
  );

  const columns = useMemo<TableColumn<ProfileChangeRequest>[]>(
    () => [
      {
        key: 'login_id',
        header: t('admin.cr.loginId'),
        value: (r) => r.login_id || '',
        width: '150px',
      },
      { key: 'name', header: t('admin.cr.name'), value: (r) => r.fname || '' },
      {
        key: 'type',
        header: t('admin.cr.type'),
        value: (r) => (isRenewal(r) ? t('admin.cr.renewal') : t('admin.cr.profile')),
      },
      {
        key: 'status',
        header: t('admin.cr.statusCol'),
        value: (r) => String(r.status),
        render: (r) => {
          const s = String(r.status);
          return (
            <span
              className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
              style={{ background: CR_STATUS_TONE[s] || 'var(--fg-muted)' }}
            >
              {t('admin.cr.status.' + s, s)}
            </span>
          );
        },
      },
      {
        key: 'requested',
        header: t('admin.cr.requestedOn'),
        value: (r) => r.requested_at || '',
        render: (r) => fmtDateShort(r.requested_at),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (r) => (
          <button
            type="button"
            onClick={() => setOpen(r)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {t('admin.cr.review')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (loading && requests.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.cr.title')}</h1>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.cr.refresh')}
        </Button>
      </div>

      <div className="mb-3">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} />
      </div>

      <Table
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        rowLabel={(r) => r.login_id || r.id}
        caption={t('admin.cr.title')}
        searchable
        searchPlaceholder={t('admin.cr.search')}
        exportFileName="change-requests.csv"
        pageSize={25}
        empty={<EmptyState icon="📝">{t('admin.cr.empty')}</EmptyState>}
      />

      <ChangeRequestSheet
        request={open}
        open={open !== null}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </>
  );
}
