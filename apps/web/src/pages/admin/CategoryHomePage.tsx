import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Button, ChartContainer, StatTile } from '@marutham/ui';
import { api, type CategoryDashboardResponse } from '@marutham/api-client';
import { semantic } from '@marutham/tokens';
import { fmtNum } from '@marutham/lib';

/**
 * The Category role home (GET /dashboard/category, Phase 4).
 *
 * The Category Manager owns the fixed product catalogue company-wide but had no
 * landing of its own — it fell to the shared Products page. This is a purpose-built
 * home: how big the catalogue is and by group, plus the two queues they act on —
 * sellers' off-catalogue product requests and their listing approvals — with quick
 * links into each. Counts only; no money.
 */
export function CategoryHomePage() {
  const { t } = useTranslation();
  const [data, setData] = useState<CategoryDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.getCategoryDashboard());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('admin.category.error', 'Could not load catalogue.'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingRequests = data?.requests.pending ?? 0;
  const pendingListings = data?.listings.pending ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">
            🏷️ {t('admin.category.title', 'Category')}
          </h1>
          <p className="text-2xs text-fg-muted">
            {t('admin.category.subtitle', 'The product catalogue at a glance')}
          </p>
        </div>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.category.refresh', 'Refresh')}
        </Button>
      </div>

      {error ? (
        <p className="rounded-base bg-surface-muted px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {/* ── Catalogue ──────────────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.category.catalogue.title', 'Catalogue')}
        loading={loading && !data}
        height="auto"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={t('admin.category.catalogue.products', 'Products')}
            value={fmtNum(data?.catalogue.count ?? 0)}
          />
          <StatTile
            label={t('admin.category.catalogue.available', 'Available')}
            value={fmtNum(data?.catalogue.available ?? 0)}
            accent={semantic.light.success}
          />
          <StatTile
            label={t('admin.category.catalogue.groups', 'Product groups')}
            value={fmtNum(data?.catalogue.groups ?? 0)}
          />
          <StatTile
            label={t('admin.category.catalogue.activeListings', 'Active listings')}
            value={fmtNum(data?.listings.active ?? 0)}
          />
        </div>

        {data && data.catalogue.by_group.length > 0 ? (
          <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto">
            {data.catalogue.by_group.map((g) => (
              <li
                key={g.group}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm"
              >
                <span className="truncate text-fg">{g.group}</span>
                <span className="tabular-nums font-semibold text-fg-muted">{fmtNum(g.count)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3">
          <Link to="/admin/products" className="ma-chip">
            {t('admin.category.gotoProducts', 'Manage catalogue →')}
          </Link>
        </div>
      </ChartContainer>

      {/* ── Review queues ──────────────────────────────────────────────────── */}
      <ChartContainer
        title={t('admin.category.queues.title', 'Waiting for review')}
        loading={loading && !data}
        height="auto"
      >
        <div className="grid grid-cols-2 gap-3">
          <StatTile
            label={t('admin.category.queues.requests', 'Product requests')}
            value={fmtNum(pendingRequests)}
            accent={pendingRequests > 0 ? semantic.light.warning : undefined}
          />
          <StatTile
            label={t('admin.category.queues.listings', 'Listing approvals')}
            value={fmtNum(pendingListings)}
            accent={pendingListings > 0 ? semantic.light.warning : undefined}
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to="/admin/product-requests" className="ma-chip">
            {t('admin.category.gotoRequests', 'Review requests →')}
          </Link>
          <Link to="/admin/listings" className="ma-chip">
            {t('admin.category.gotoListings', 'Review listings →')}
          </Link>
        </div>
      </ChartContainer>
    </div>
  );
}
