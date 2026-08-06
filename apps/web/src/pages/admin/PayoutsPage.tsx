import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  FilterChips,
  Modal,
  Spinner,
  StatTile,
  Table,
  type TableColumn,
} from '@marutham/ui';
import { api, type AdminPayout } from '@marutham/api-client';
import { fmtDateShort, fmtMoney, fmtMoneyInt } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { PayoutDetailSheet, PAYOUT_STATUS_TONE } from './PayoutDetailSheet';
import { useAdminGeo } from './AdminGeoContext';
import { AdminGeoFilter } from './AdminGeoFilter';
import { useTableLabels } from './useTableLabels';

const farmerName = (p: AdminPayout) => `${p.farmer?.fname || ''} ${p.farmer?.lname || ''}`.trim();
const sumAmount = (list: AdminPayout[]) =>
  list.reduce((s, p) => s + (parseFloat(String(p.amount)) || 0), 0);

export function PayoutsPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const { user } = useAuth();
  const toast = useToast();
  const canSettle = user?.admin_role === 'Head Office';

  const [payouts, setPayouts] = useState<AdminPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [open, setOpen] = useState<AdminPayout | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdminPayouts();
      setPayouts(res.payouts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load payouts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Everything below is derived from the geo-scoped set so the tiles, chips and
  // table all agree with the console-wide State/District pick.
  const { inGeoScope } = useAdminGeo();
  const scoped = useMemo(
    () => payouts.filter((p) => inGeoScope(p.farmer?.district)),
    [payouts, inGeoScope],
  );

  const paid = useMemo(() => scoped.filter((p) => p.status === 'paid'), [scoped]);
  const pending = useMemo(() => scoped.filter((p) => p.status === 'pending'), [scoped]);

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: `${t('admin.pay.all')} (${scoped.length})` },
      { value: 'pending', label: `${t('admin.pay.status.pending')} (${pending.length})` },
      { value: 'paid', label: `${t('admin.pay.status.paid')} (${paid.length})` },
    ],
    [scoped.length, pending.length, paid.length, t],
  );

  const rows = useMemo(
    () => (status === 'all' ? scoped : scoped.filter((p) => p.status === status)),
    [scoped, status],
  );

  const columns = useMemo<TableColumn<AdminPayout>[]>(
    () => [
      {
        key: 'farmer',
        header: t('admin.pay.farmer'),
        value: (p) => farmerName(p) || p.farmer?.phone || '',
      },
      { key: 'phone', header: t('admin.pay.phone'), value: (p) => p.farmer?.phone || '' },
      { key: 'order', header: t('admin.pay.order'), value: (p) => p.order?.code || '' },
      {
        key: 'amount',
        header: t('admin.pay.amount'),
        align: 'right',
        value: (p) => Number(p.amount ?? 0),
        render: (p) => fmtMoney(p.amount),
      },
      {
        key: 'status',
        header: t('admin.pay.statusCol'),
        value: (p) => String(p.status),
        render: (p) => (
          <span
            className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
            style={{ background: PAYOUT_STATUS_TONE[String(p.status)] || 'var(--fg-muted)' }}
          >
            {t('admin.pay.status.' + p.status, String(p.status))}
          </span>
        ),
      },
      {
        key: 'created',
        header: t('admin.pay.createdOn'),
        value: (p) => p.created_at || '',
        render: (p) => fmtDateShort(p.created_at, i18n.language),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (p) => (
          <button
            type="button"
            onClick={() => setOpen(p)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {t('admin.pay.view')}
          </button>
        ),
      },
    ],
    [t],
  );

  async function runSettlement() {
    setRunning(true);
    try {
      const res = await api.runSettlement();
      toast(res.message || t('admin.pay.settled', { count: res.created }), 'ok');
      setConfirmRun(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not run settlement', 'er');
    } finally {
      setRunning(false);
    }
  }

  if (loading && payouts.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.pay.title')}</h1>
        <div className="flex items-center gap-2">
          {canSettle ? (
            <Button onClick={() => setConfirmRun(true)} disabled={running}>
              ⚡ {t('admin.pay.run')}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={load} disabled={loading}>
            ↻ {t('admin.pay.refresh')}
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatTile
          label={t('admin.pay.totalPaid')}
          value={fmtMoneyInt(sumAmount(paid))}
          hint={t('admin.pay.records', { count: paid.length })}
          accent="var(--success)"
        />
        <StatTile
          label={t('admin.pay.totalPending')}
          value={fmtMoneyInt(sumAmount(pending))}
          hint={t('admin.pay.records', { count: pending.length })}
          accent="var(--warning-strong)"
        />
      </div>

      <AdminGeoFilter className="mb-3" />

      <div className="mb-3">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} />
      </div>

      <Table
        labels={tableLabels}
        rows={rows}
        columns={columns}
        rowId={(p) => p.id}
        rowLabel={(p) => farmerName(p) || p.id}
        caption={t('admin.pay.title')}
        searchable
        searchPlaceholder={t('admin.pay.search')}
        exportFileName="payouts.csv"
        pageSize={25}
        empty={<EmptyState icon="💸">{t('admin.pay.empty')}</EmptyState>}
      />

      <PayoutDetailSheet payout={open} open={open !== null} onClose={() => setOpen(null)} />

      <Modal
        open={confirmRun}
        title={t('admin.pay.runConfirm')}
        onClose={() => setConfirmRun(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRun(false)} disabled={running}>
              {t('admin.pay.cancel')}
            </Button>
            <Button onClick={runSettlement} disabled={running}>
              {running ? t('admin.pay.running') : t('admin.pay.run')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">{t('admin.pay.runConfirmBody')}</p>
      </Modal>
    </>
  );
}
