import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type AdminDistrictPrice } from '@marutham/api-client';
import { fmtMoney, type Product } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { ProductEditSheet } from './ProductEditSheet';

/** First district price (rupees) for the summary column, or null. */
function firstPrice(p: Product): AdminDistrictPrice | null {
  const rows = (p.product_district_prices as AdminDistrictPrice[] | undefined) || [];
  return rows[0] || null;
}
function priceCount(p: Product): number {
  return ((p.product_district_prices as AdminDistrictPrice[] | undefined) || []).length;
}

export function ProductsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canEdit = user?.admin_role === 'Head Office';

  const [products, setProducts] = useState<Product[]>([]);
  const [districts, setDistricts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState('all');
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // No district filter → the full product_district_prices array comes back.
      const res = await api.getProducts();
      setProducts(res.products || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // District list for the price editor — flatten the state→district→taluk tree.
  useEffect(() => {
    api
      .getLocations()
      .then((res) => {
        const set = new Set<string>();
        Object.values(res.tree || {}).forEach((state) =>
          Object.keys(state).forEach((d) => set.add(d)),
        );
        setDistricts(Array.from(set).sort((a, b) => a.localeCompare(b)));
      })
      .catch(() => setDistricts([]));
  }, []);

  const groupOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach((p) => {
      const g = p.product_group || '—';
      counts[g] = (counts[g] || 0) + 1;
    });
    const groups = Object.keys(counts).sort((a, b) => a.localeCompare(b));
    return [
      { value: 'all', label: `${t('admin.prod.all')} (${products.length})` },
      ...groups.map((g) => ({ value: g, label: `${g} (${counts[g]})` })),
    ];
  }, [products, t]);

  const rows = useMemo(
    () => (group === 'all' ? products : products.filter((p) => (p.product_group || '—') === group)),
    [products, group],
  );

  const columns = useMemo<TableColumn<Product>[]>(
    () => [
      {
        key: 'name',
        header: t('admin.prod.name'),
        value: (p) => p.name || '',
        render: (p) => (
          <div className="min-w-0">
            <div className="truncate font-semibold text-fg">{p.name}</div>
            {p.regional_name ? (
              <div className="truncate text-2xs text-fg-muted tamil">{p.regional_name}</div>
            ) : null}
          </div>
        ),
      },
      { key: 'group', header: t('admin.prod.group'), value: (p) => p.product_group || '' },
      { key: 'unit', header: t('admin.prod.unit'), value: (p) => p.unit || '' },
      {
        key: 'fee',
        header: t('admin.prod.fee'),
        value: (p) => (p.platform_fee_pct != null ? `${p.platform_fee_pct}%` : ''),
      },
      {
        key: 'price',
        header: t('admin.prod.price'),
        value: (p) => {
          const fp = firstPrice(p);
          return fp?.market_price != null ? String(parseFloat(String(fp.market_price))) : '';
        },
        render: (p) => {
          const fp = firstPrice(p);
          if (!fp) return <span className="text-2xs text-fg-muted">{t('admin.prod.noPrice')}</span>;
          const n = priceCount(p);
          return (
            <span className="tabular-nums">
              {fmtMoney(fp.market_price)}
              <span className="text-2xs text-fg-muted">
                {' '}
                {fp.district}
                {n > 1 ? ` +${n - 1}` : ''}
              </span>
            </span>
          );
        },
      },
      {
        key: 'available',
        header: t('admin.prod.availability'),
        value: (p) => (p.available !== false ? 'available' : 'unavailable'),
        render: (p) => {
          const on = p.available !== false;
          return (
            <span
              className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
              style={{ background: on ? 'var(--success)' : 'var(--fg-muted)' }}
            >
              {on ? t('admin.prod.available') : t('admin.prod.unavailable')}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (p) => (
          <button
            type="button"
            onClick={() => setEditing(p)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {canEdit ? t('admin.prod.edit') : t('admin.prod.view')}
          </button>
        ),
      },
    ],
    [t, canEdit],
  );

  if (loading && products.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-primary">{t('admin.prod.title')}</h1>
        <div className="flex items-center gap-2">
          {canEdit ? (
            <Button onClick={() => setCreating(true)}>+ {t('admin.prod.add')}</Button>
          ) : null}
          <Button variant="ghost" onClick={load} disabled={loading}>
            ↻ {t('admin.prod.refresh')}
          </Button>
        </div>
      </div>

      <div className="mb-3">
        <FilterChips options={groupOptions} value={group} onChange={setGroup} />
      </div>

      <Table
        rows={rows}
        columns={columns}
        rowId={(p) => p.id}
        rowLabel={(p) => p.name}
        caption={t('admin.prod.title')}
        searchable
        searchPlaceholder={t('admin.prod.search')}
        exportFileName="products.csv"
        pageSize={25}
        empty={<EmptyState icon="🌾">{t('admin.prod.empty')}</EmptyState>}
      />

      <ProductEditSheet
        product={editing}
        open={editing !== null}
        canEdit={canEdit}
        districts={districts}
        onClose={() => setEditing(null)}
        onChanged={load}
      />
      <ProductEditSheet
        product={null}
        open={creating}
        canEdit={canEdit}
        districts={districts}
        onClose={() => setCreating(false)}
        onChanged={load}
      />
    </>
  );
}
