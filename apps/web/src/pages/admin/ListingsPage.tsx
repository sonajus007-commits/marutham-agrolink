import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, FilterChips, Spinner, Table, type TableColumn } from '@marutham/ui';
import { api, type AdminListing } from '@marutham/api-client';
import {
  fmtDateShort,
  fmtMoney,
  subscriptionStatus,
  isListingStale,
  listingWaitDays,
  type ListingReviewStatus,
} from '@marutham/lib';
import { ListingReviewSheet, LISTING_STATUS_TONE } from './ListingReviewSheet';
import { useAdminGeo } from './AdminGeoContext';
import { AdminGeoFilter } from './AdminGeoFilter';
import { useTableLabels } from './useTableLabels';

/**
 * Listing approvals — a seller's request to sell a product.
 *
 * The last section of the legacy admin console with no React home. Until now the
 * Admin Head dashboard COUNTED pending listings and could not link anywhere, so
 * the number was a dead end; this screen is the door it was missing.
 *
 * The endpoint has no "all" mode — GET /listings/admin/pending is a hard
 * `.eq('listing_status', …)` — so, exactly like the change-requests screen, we ask
 * for each status in parallel and merge. That keeps the chip counts LIVE rather
 * than refetching on every chip click and showing counts for only one bucket.
 */
const STATUSES: ListingReviewStatus[] = ['pending', 'active', 'rejected'];

export function ListingsPage() {
  const { t, i18n } = useTranslation();
  const tableLabels = useTableLabels();
  const [listings, setListings] = useState<AdminListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [open, setOpen] = useState<AdminListing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(STATUSES.map((s) => api.getAdminListings(s)));
      setListings(results.flatMap((r) => r.listings || []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load listings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Geo-scoped base so the chip counts, stale headline and table all reflect the
  // district pick.
  const { inGeoScope } = useAdminGeo();
  const scoped = useMemo(
    () => listings.filter((l) => inGeoScope(l.farmer?.district)),
    [listings, inGeoScope],
  );

  const statusOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    scoped.forEach((l) => {
      const s = String(l.listing_status || 'pending');
      counts[s] = (counts[s] || 0) + 1;
    });
    return [
      { value: 'pending', label: `${t('admin.lst.status.pending')} (${counts.pending || 0})` },
      { value: 'active', label: `${t('admin.lst.status.active')} (${counts.active || 0})` },
      { value: 'rejected', label: `${t('admin.lst.status.rejected')} (${counts.rejected || 0})` },
      { value: 'all', label: `${t('admin.lst.all')} (${scoped.length})` },
    ];
  }, [scoped, t]);

  const rows = useMemo(
    () =>
      status === 'all'
        ? scoped
        : scoped.filter((l) => String(l.listing_status || 'pending') === status),
    [scoped, status],
  );

  /* How many sellers have been waiting too long. Surfaced as a headline, not
     buried in a column: an approval queue's failure mode is going quiet, and a
     seller cannot earn from a product that is still pending. */
  const staleCount = useMemo(
    () => scoped.filter((l) => isListingStale(l.created_at, l.listing_status)).length,
    [scoped],
  );

  const columns = useMemo<TableColumn<AdminListing>[]>(
    () => [
      {
        key: 'product',
        header: t('admin.lst.product'),
        value: (l) => l.product?.name || '',
        render: (l) => (
          <span className="font-bold text-fg">
            {l.product?.name || '—'}{' '}
            {l.product?.code ? (
              <span className="text-2xs font-normal text-fg-muted">{l.product.code}</span>
            ) : null}
          </span>
        ),
      },
      {
        key: 'seller',
        header: t('admin.lst.seller'),
        value: (l) => `${l.farmer?.fname || ''} ${l.farmer?.lname || ''}`.trim(),
        render: (l) => {
          const sub = subscriptionStatus({
            subscription_plan: l.farmer?.subscription_plan,
            subscription_expires_at: l.farmer?.subscription_expires_at,
          });
          return (
            <span className="flex flex-col">
              <span className="text-fg">
                {`${l.farmer?.fname || ''} ${l.farmer?.lname || ''}`.trim() || '—'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-2xs tabular-nums text-fg-muted">
                  {l.farmer?.login_id || ''}
                </span>
                {/* An expired seller must not be approved onto the storefront
                  unnoticed — the row says so before the sheet is even opened. */}
                {sub.level === 'expired' ? (
                  <span className="text-2xs font-bold text-danger">
                    ⚠ {t('admin.lst.sub.expired')}
                  </span>
                ) : null}
              </span>
            </span>
          );
        },
      },
      {
        key: 'price',
        header: t('admin.lst.price'),
        // Money, already in rupees from the middleware.
        value: (l) => fmtMoney(l.farmer_price),
        render: (l) => (
          <span className="tabular-nums text-fg">
            {fmtMoney(l.farmer_price)}
            <span className="text-2xs text-fg-muted">
              {' '}
              / {l.product?.unit || t('admin.lst.unit')}
            </span>
          </span>
        ),
      },
      {
        key: 'qty',
        header: t('admin.lst.qty'),
        value: (l) => (l.qty_available != null ? String(l.qty_available) : ''),
      },
      { key: 'district', header: t('admin.lst.district'), value: (l) => l.farmer?.district || '' },
      {
        key: 'submitted',
        header: t('admin.lst.submitted'),
        value: (l) => l.created_at || '',
        render: (l) => {
          const stale = isListingStale(l.created_at, l.listing_status);
          const waited = listingWaitDays(l.created_at);
          return (
            <span className="flex flex-col">
              <span className="text-2xs text-fg">{fmtDateShort(l.created_at, i18n.language)}</span>
              {stale && waited !== null ? (
                <span className="text-2xs font-bold text-danger">
                  {t('admin.lst.waiting', { count: waited })}
                </span>
              ) : null}
            </span>
          );
        },
      },
      {
        key: 'status',
        header: t('admin.lst.statusCol'),
        value: (l) => String(l.listing_status || 'pending'),
        render: (l) => {
          const s = String(l.listing_status || 'pending');
          return (
            <span
              className="inline-block rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
              style={{ background: LISTING_STATUS_TONE[s] || 'var(--fg-muted)' }}
            >
              {t('admin.lst.status.' + s, s)}
            </span>
          );
        },
      },
      {
        key: 'actions',
        header: '',
        sortable: false,
        exportable: false,
        render: (l) => (
          <button
            type="button"
            onClick={() => setOpen(l)}
            className="cursor-pointer appearance-none rounded-sm border-0 bg-surface-muted px-2.5 py-1 text-2xs font-bold text-primary hover:bg-primary hover:text-primary-on focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
          >
            {t('admin.lst.review')}
          </button>
        ),
      },
    ],
    [t],
  );

  if (loading && listings.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">{t('admin.lst.title')}</h1>
          {staleCount > 0 ? (
            <p className="text-2xs font-bold text-danger">
              ⚠ {t('admin.lst.staleWarning', { count: staleCount })}
            </p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={load} disabled={loading}>
          ↻ {t('admin.lst.refresh')}
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
        rowId={(l) => l.id}
        rowLabel={(l) => l.product?.name || l.id}
        caption={t('admin.lst.title')}
        searchable
        searchPlaceholder={t('admin.lst.search')}
        exportFileName="listing-approvals.csv"
        pageSize={25}
        empty={<EmptyState icon="🌾">{t('admin.lst.empty')}</EmptyState>}
      />

      <ListingReviewSheet
        listing={open}
        open={open !== null}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </>
  );
}
