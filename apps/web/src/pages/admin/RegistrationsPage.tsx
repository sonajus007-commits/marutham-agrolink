import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type Registration } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { RegistrationDetailSheet, REG_STATUS_TONE } from './RegistrationDetailSheet';
import { useAdminGeo } from './AdminGeoContext';
import { AdminGeoFilter } from './AdminGeoFilter';
import { useTableLabels } from './useTableLabels';

const statusOf = (r: Registration) => String(r.approval_status || 'pending_review');

export function RegistrationsPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const [regs, setRegs] = useState<Registration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('pending_review');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch everything once; the chips filter client-side so counts stay live.
      const res = await api.getRegistrations('all');
      setRegs(res.registrations || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load registrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    regs.forEach((r) => {
      const s = statusOf(r);
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      {
        value: 'pending_review',
        label: `${t('admin.reg.status.pending_review')} (${counts.pending_review || 0})`,
      },
      {
        value: 'payment_pending',
        label: `${t('admin.reg.status.payment_pending')} (${counts.payment_pending || 0})`,
      },
      { value: 'active', label: `${t('admin.reg.status.active')} (${counts.active || 0})` },
      { value: 'rejected', label: `${t('admin.reg.status.rejected')} (${counts.rejected || 0})` },
      { value: 'all', label: `${t('admin.reg.all')} (${regs.length})` },
    ];
  }, [regs, t]);

  const { inGeoScope } = useAdminGeo();
  const rows = useMemo(
    () =>
      regs.filter(
        (r) => (status === 'all' || statusOf(r) === status) && inGeoScope(r.district as string),
      ),
    [regs, status, inGeoScope],
  );

  const columns = useMemo<TableColumn<Registration>[]>(
    () => [
      {
        key: 'login_id',
        header: t('admin.reg.loginId'),
        value: (r) => r.login_id || '',
        width: '150px',
      },
      {
        key: 'name',
        header: t('admin.reg.name'),
        value: (r) => `${r.fname || ''} ${r.lname || ''}`.trim(),
      },
      { key: 'type', header: t('admin.reg.type'), value: (r) => (r.seller_type as string) || '' },
      {
        key: 'district',
        header: t('admin.reg.district'),
        value: (r) => (r.district as string) || '',
      },
      {
        key: 'status',
        header: t('admin.reg.statusCol'),
        value: (r) => statusOf(r),
        render: (r) => {
          const s = statusOf(r);
          return (
            <span
              className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
              style={{ background: REG_STATUS_TONE[s] || 'var(--fg-muted)' }}
            >
              {t('admin.reg.status.' + s, s)}
            </span>
          );
        },
      },
      { key: 'phone', header: t('admin.reg.phone'), value: (r) => r.phone || '' },
      {
        key: 'applied',
        header: t('admin.reg.appliedOn'),
        value: (r) => (r.created_at as string) || '',
        render: (r) => fmtDateShort(r.created_at as string, i18n.language),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (r) => (
          <button
            type="button"
            onClick={() => setOpenId(r.id)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {t('admin.reg.review')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (loading && regs.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.reg.title')}</h1>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.reg.refresh')}
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
        rowLabel={(r) => r.login_id || r.id}
        caption={t('admin.reg.title')}
        searchable
        searchPlaceholder={t('admin.reg.search')}
        exportFileName="registrations.csv"
        pageSize={25}
        empty={<EmptyState icon="📋">{t('admin.reg.empty')}</EmptyState>}
      />

      <RegistrationDetailSheet
        regId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </>
  );
}
