import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, Spinner, Select, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  DEFAULT_CUTOFF,
  cutoffTimestamp,
  requestableProducts,
  type FarmerListing,
  type Product,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { ListingCard } from './ListingCard';
import { ListingFormSheet } from './ListingFormSheet';

/** A product request is a listing with no price, not yet listed. */
const REQUEST_CUTOFF = DEFAULT_CUTOFF;

export function ProductsTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();

  const [listings, setListings] = useState<FarmerListing[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** The form only ever edits: a listing row already exists once approved. */
  const [editing, setEditing] = useState<FarmerListing | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<FarmerListing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, p] = await Promise.all([
        api.getMyListings(),
        api.getProducts(user?.district ? { district: String(user.district) } : undefined),
      ]);
      setListings(l.listings || []);
      setProducts(p.products || []);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t('farmer.prod.loadFailed', 'Could not load your products'),
      );
    } finally {
      setLoading(false);
    }
    // `t` is a dependency: without it this closure keeps the language it was
    // created in, and the fallback would still be English after a switch.
  }, [user?.district, t]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Products this seller has not already requested, in any state. */
  const available = useMemo(() => requestableProducts(products, listings), [products, listings]);

  async function act(id: string, fn: () => Promise<unknown>, ok: string) {
    setBusyId(id);
    try {
      await fn();
      toast(ok, 'ok');
      await load();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('farmer.prod.actionFailed', 'That did not work'),
        'er',
      );
    } finally {
      setBusyId(null);
    }
  }

  async function requestProduct(productId: string) {
    const cutoff_ts = cutoffTimestamp(REQUEST_CUTOFF);
    if (!cutoff_ts) return;
    setRequesting(false);
    await act(
      productId,
      () =>
        api.createListing({
          product_id: productId,
          farmer_price: 0,
          qty_available: 0,
          time_available: REQUEST_CUTOFF,
          cutoff_ts,
          listed: false,
        }),
      t('farmer.prod.requested', 'Product request submitted — an admin will review it.'),
    );
  }

  if (loading && listings.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      {/* The only way to create a listing is to request the product: approval
          creates the row, and farmer_listings is unique on (farmer, product).
          Pricing an approved product is therefore an edit, never an insert. */}
      <div className="fm-actionbar">
        <Button onClick={() => setRequesting(true)} disabled={available.length === 0}>
          + {t('farmer.prod.request')}
        </Button>
      </div>

      {listings.length === 0 ? (
        <EmptyState icon="🌾">
          <p>{t('farmer.prod.empty')}</p>
        </EmptyState>
      ) : (
        <div className="listing-list">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              busy={busyId === l.id}
              onEdit={() => setEditing(l)}
              onConfirm={() =>
                act(
                  l.id,
                  () => api.setListingFlags(l.id, { confirmed: true }),
                  t('farmer.prod.confirmed', 'Confirmed — customers can order it.'),
                )
              }
              onUnconfirm={() =>
                act(
                  l.id,
                  () => api.setListingFlags(l.id, { confirmed: false }),
                  t('farmer.prod.unconfirmed', 'Confirmation removed.'),
                )
              }
              onDelete={() => setConfirmDelete(l)}
            />
          ))}
        </div>
      )}

      {editing ? (
        <ListingFormSheet
          open
          listing={editing}
          product={
            products.find((p) => p.id === (editing.product?.id ?? editing.product_id)) || null
          }
          sellerType={user?.seller_type}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}

      <RequestProductModal
        open={requesting}
        products={available}
        onClose={() => setRequesting(false)}
        onRequest={requestProduct}
      />

      <Modal
        open={confirmDelete !== null}
        title={
          confirmDelete?.listing_status === 'pending'
            ? t('farmer.prod.cancelRequestTitle', 'Cancel this request?')
            : t('farmer.prod.removeTitle', 'Remove this listing?')
        }
        closeLabel={t('common.close', 'Close')}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              {t('consumer.addr.keep', 'Keep it')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const l = confirmDelete!;
                setConfirmDelete(null);
                void act(
                  l.id,
                  () => api.deleteListing(l.id),
                  t('farmer.prod.removed', 'Listing removed.'),
                );
              }}
            >
              {t('farmer.listing.remove', 'Remove')}
            </Button>
          </>
        }
      >
        <p style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.6 }}>
          <Trans
            i18nKey="farmer.prod.removeBody"
            values={{ name: confirmDelete?.product?.name ?? '' }}
            defaults="<1>{{name}}</1> will no longer be offered to customers. You can request it again later."
            components={{ 1: <strong /> }}
          />
        </p>
      </Modal>
    </>
  );
}

function RequestProductModal({
  open,
  products,
  onClose,
  onRequest,
}: {
  open: boolean;
  products: Product[];
  onClose: () => void;
  onRequest: (productId: string) => void;
}) {
  const { t } = useTranslation();
  const [pick, setPick] = useState('');
  useEffect(() => {
    if (open) setPick('');
  }, [open]);

  return (
    <Modal
      open={open}
      title={t('farmer.prod.requestTitle', 'Request a new product')}
      subtitle={t(
        'farmer.prod.requestSubtitle',
        'An admin approves the product before you can price it.',
      )}
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button disabled={!pick} onClick={() => onRequest(pick)}>
            {t('farmer.prod.submitRequest', 'Submit request')}
          </Button>
        </>
      }
    >
      {products.length === 0 ? (
        <p className="fm-note">
          {t('farmer.prod.allRequested', 'You have already requested every available product.')}
        </p>
      ) : (
        <label className="mb-3">
          <span className={FIELD_LABEL_CLASS}>{t('farmer.form.product', 'Product')}</span>
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">— {t('farmer.prod.selectProduct', 'Select a product')} —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.regional_name ? ` — ${p.regional_name}` : ''} ({p.unit})
              </option>
            ))}
          </Select>
        </label>
      )}
    </Modal>
  );
}
