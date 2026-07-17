import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  fmtDateShort,
  fmtMoney,
  isOrderCancelled,
  payMethodKey,
  statusColor,
  statusKey,
  type Order,
} from '@marutham/lib';
import { AdminOrderSheet } from './AdminOrderSheet';
import { useTableLabels } from './useTableLabels';

const statusOf = (o: Order) => (isOrderCancelled(o) ? 'Cancelled' : o.status);

export function OrdersPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrders();
      setOrders(res.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Status filter options, derived from the data so we never show an empty bucket.
  const statusOptions = useMemo(() => {
    const counts = new Map<string, number>();
    orders.forEach((o) => counts.set(statusOf(o), (counts.get(statusOf(o)) || 0) + 1));
    return [
      { value: 'all', label: `${t('admin.orders.all')} (${orders.length})` },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        // The VALUE stays the English status — it is what the filter compares.
        .map(([s, n]) => ({ value: s, label: `${t(statusKey(s), s)} (${n})` })),
    ];
  }, [orders, t]);

  const rows = useMemo(
    () => (status === 'all' ? orders : orders.filter((o) => statusOf(o) === status)),
    [orders, status],
  );

  const columns = useMemo<TableColumn<Order>[]>(
    () => [
      { key: 'code', header: t('admin.orders.code'), value: (o) => o.code || o.id, width: '150px' },
      { key: 'consumer', header: t('admin.orders.customer'), value: (o) => o.consumer_name || '' },
      {
        key: 'district',
        header: t('admin.orders.district'),
        value: (o) => (o.district as string) || '',
      },
      {
        key: 'status',
        header: t('admin.orders.status'),
        /* `value` stays the English status: it drives the sort, the filter and the
           CSV. Only the cell is spoken. */
        value: (o) => statusOf(o),
        render: (o) => (
          <span
            className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
            style={{ background: statusColor(statusOf(o)) }}
          >
            {t(statusKey(statusOf(o)), statusOf(o))}
          </span>
        ),
      },
      {
        key: 'pay',
        header: t('admin.orders.payment'),
        value: (o) => o.pay_method || '',
        render: (o) => (o.pay_method ? t(payMethodKey(o.pay_method), o.pay_method) : ''),
      },
      {
        key: 'total',
        header: t('admin.orders.total'),
        align: 'right',
        value: (o) => Number(o.total ?? 0),
        render: (o) => fmtMoney(o.total),
      },
      {
        key: 'date',
        header: t('admin.orders.placedOn'),
        value: (o) => o.created_at || '',
        render: (o) => fmtDateShort(o.created_at, i18n.language),
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (o) => (
          <button
            type="button"
            onClick={() => setOpenId(o.id)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {t('admin.orders.view')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.orders.title')}</h1>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.orders.refresh')}
        </Button>
      </div>

      <div className="mb-3">
        <FilterChips options={statusOptions} value={status} onChange={setStatus} />
      </div>

      <Table
        labels={tableLabels}
        rows={rows}
        columns={columns}
        rowId={(o) => o.id}
        rowLabel={(o) => o.code || o.id}
        caption={t('admin.orders.title')}
        searchable
        searchPlaceholder={t('admin.orders.search')}
        exportFileName="orders.csv"
        pageSize={25}
        empty={<EmptyState icon="📦">{t('admin.orders.empty')}</EmptyState>}
      />

      <AdminOrderSheet
        orderId={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
        onChanged={load}
      />
    </>
  );
}
