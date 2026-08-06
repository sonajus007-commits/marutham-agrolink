import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type AdminReturn } from '@marutham/api-client';
import { fmtDateShort, fmtMoney } from '@marutham/lib';
import { ReturnDetailSheet, RETURN_STATUS_TONE, returnStatus } from './ReturnDetailSheet';
import { useAdminGeo } from './AdminGeoContext';
import { AdminGeoFilter } from './AdminGeoFilter';
import { useTableLabels } from './useTableLabels';

export function ReturnsPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const [returns, setReturns] = useState<AdminReturn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('pending');
  const [open, setOpen] = useState<AdminReturn | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getReturns();
      setReturns(res.returns || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load returns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Geo-scoped base so the chip counts and table both reflect the district pick.
  const { inGeoScope } = useAdminGeo();
  const scoped = useMemo(
    () => returns.filter((r) => inGeoScope(r.order?.district)),
    [returns, inGeoScope],
  );

  const statusOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    scoped.forEach((r) => {
      const s = returnStatus(r);
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      { value: 'pending', label: `${t('admin.ret.status.pending')} (${counts.pending || 0})` },
      { value: 'accepted', label: `${t('admin.ret.status.accepted')} (${counts.accepted || 0})` },
      {
        value: 'collected',
        label: `${t('admin.ret.status.collected')} (${counts.collected || 0})`,
      },
      { value: 'rejected', label: `${t('admin.ret.status.rejected')} (${counts.rejected || 0})` },
      { value: 'all', label: `${t('admin.ret.all')} (${scoped.length})` },
    ];
  }, [scoped, t]);

  const rows = useMemo(
    () => (status === 'all' ? scoped : scoped.filter((r) => returnStatus(r) === status)),
    [scoped, status],
  );

  const columns = useMemo<TableColumn<AdminReturn>[]>(
    () => [
      { key: 'code', header: t('admin.ret.code'), value: (r) => r.code || '', width: '160px' },
      { key: 'order', header: t('admin.ret.order'), value: (r) => r.order?.code || '' },
      {
        key: 'customer',
        header: t('admin.ret.customer'),
        value: (r) => r.order?.consumer_name || '',
      },
      {
        key: 'type',
        header: t('admin.ret.type'),
        value: (r) => (r.full_return ? t('admin.ret.full') : t('admin.ret.partial')),
      },
      {
        key: 'refund',
        header: t('admin.ret.refund'),
        align: 'right',
        value: (r) => Number(r.refund_amt ?? 0),
        render: (r) => fmtMoney(r.refund_amt),
      },
      {
        key: 'status',
        header: t('admin.ret.statusCol'),
        value: (r) => returnStatus(r),
        render: (r) => {
          const s = returnStatus(r);
          return (
            <span
              className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
              style={{ background: RETURN_STATUS_TONE[s] }}
            >
              {t('admin.ret.status.' + s)}
            </span>
          );
        },
      },
      {
        key: 'requested',
        header: t('admin.ret.requestedOn'),
        value: (r) => r.requested_at || '',
        render: (r) => fmtDateShort(r.requested_at, i18n.language),
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
            {returnStatus(r) === 'pending' ? t('admin.ret.review') : t('admin.ret.view')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (loading && returns.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.ret.title')}</h1>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.ret.refresh')}
        </Button>
      </div>

      <AdminGeoFilter className="mb-3" />

      <div className="mb-3">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} />
      </div>

      <Table
        labels={tableLabels}
        rows={rows}
        columns={columns}
        rowId={(r) => r.id}
        rowLabel={(r) => r.code}
        caption={t('admin.ret.title')}
        searchable
        searchPlaceholder={t('admin.ret.search')}
        exportFileName="returns.csv"
        pageSize={25}
        empty={<EmptyState icon="↩️">{t('admin.ret.empty')}</EmptyState>}
      />

      <ReturnDetailSheet
        ret={open}
        open={open !== null}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </>
  );
}
