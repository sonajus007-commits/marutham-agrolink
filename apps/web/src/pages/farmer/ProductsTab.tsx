import { useCallback, useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, Spinner, Select, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api, type ProductRequest } from '@marutham/api-client';
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
  const [newRequesting, setNewRequesting] = useState(false);
  const [myRequests, setMyRequests] = useState<ProductRequest[]>([]);
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
      // Off-catalogue product requests — best-effort, must not fail the whole tab.
      api
        .getProductRequests()
        .then((r) => setMyRequests(r.requests || []))
        .catch(() => setMyRequests([]));
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

  async function submitNewRequest(payload: {
    name: string;
    unit: string;
    regional_name?: string;
    category?: string;
    note?: string;
  }) {
    setNewRequesting(false);
    try {
      await api.createProductRequest(payload);
      toast(t('farmer.newreq.done', 'Sent for review — we’ll notify you when it’s added.'), 'ok');
      await load();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('farmer.prod.actionFailed', 'That did not work'),
        'er',
      );
    }
  }

  // Only the requests still worth showing the seller: anything not yet approved
  // (an approved one becomes a normal catalogue product they can now list).
  const openRequests = myRequests.filter((r) => r.status !== 'approved');

  if (loading && listings.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      {/* The only way to create a listing is to request the product: approval
          creates the row, and farmer_listings is unique on (farmer, product).
          Pricing an approved product is therefore an edit, never an insert. */}
      <div
        className="fm-actionbar"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}
      >
        <Button onClick={() => setRequesting(true)} disabled={available.length === 0}>
          + {t('farmer.prod.request')}
        </Button>
        {/* Off-catalogue: always available, so a seller (esp. a retailer) is never
            blocked when what they sell isn't in the produce catalogue yet. */}
        <Button variant="ghost" onClick={() => setNewRequesting(true)}>
          {t('farmer.newreq.cta', "Can't find it? Request a new product")}
        </Button>
      </div>

      {openRequests.length > 0 ? (
        <div className="fm-note" style={{ marginBottom: 12 }}>
          <strong>{t('farmer.newreq.pendingTitle', 'Product requests')}</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
            {openRequests.map((r) => (
              <li key={r.id} style={{ marginBottom: 2 }}>
                {r.name} ({r.unit}) —{' '}
                <span style={{ color: r.status === 'rejected' ? 'var(--red)' : 'var(--sun)' }}>
                  {r.status === 'rejected'
                    ? t('farmer.newreq.rejected', 'not added')
                    : t('farmer.newreq.pending', 'under review')}
                </span>
                {r.status === 'rejected' && r.review_reason ? ` — ${r.review_reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

      <NewProductRequestModal
        open={newRequesting}
        onClose={() => setNewRequesting(false)}
        onSubmit={submitNewRequest}
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

/* Off-catalogue request: a free-text proposal for a product that isn't in the
 * catalogue at all (a retailer's packaged goods, a produce type not yet listed).
 * An admin reviews it and, on approval, it becomes a real catalogue product. */
function NewProductRequestModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (p: {
    name: string;
    unit: string;
    regional_name?: string;
    category?: string;
    note?: string;
  }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [regionalName, setRegionalName] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setUnit('');
      setRegionalName('');
      setCategory('');
      setNote('');
    }
  }, [open]);

  const canSubmit = name.trim().length > 0 && unit.trim().length > 0;
  const input = { width: '100%', padding: '8px 10px' } as const;

  return (
    <Modal
      open={open}
      title={t('farmer.newreq.title', 'Request a new product')}
      subtitle={t(
        'farmer.newreq.subtitle',
        'Not in our catalogue yet? Tell us about it — an admin reviews it, then you can list it.',
      )}
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                name: name.trim(),
                unit: unit.trim(),
                regional_name: regionalName.trim() || undefined,
                category: category.trim() || undefined,
                note: note.trim() || undefined,
              })
            }
          >
            {t('farmer.prod.submitRequest', 'Submit request')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('farmer.newreq.name', 'Product name')} *</span>
          <input
            style={input}
            aria-label={t('farmer.newreq.name', 'Product name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>
            {t('farmer.newreq.regional', 'Name in Tamil (optional)')}
          </span>
          <input
            style={input}
            aria-label={t('farmer.newreq.regional', 'Name in Tamil (optional)')}
            value={regionalName}
            onChange={(e) => setRegionalName(e.target.value)}
            maxLength={120}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('farmer.newreq.unit', 'Sold by (unit)')} *</span>
          <input
            style={input}
            aria-label={t('farmer.newreq.unit', 'Sold by (unit)')}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder={t('farmer.newreq.unitEg', 'kg, packet, bunch, litre…')}
            maxLength={40}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>
            {t('farmer.newreq.category', 'Category (optional)')}
          </span>
          <input
            style={input}
            aria-label={t('farmer.newreq.category', 'Category (optional)')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>
            {t('farmer.newreq.note', 'Anything else (optional)')}
          </span>
          <textarea
            style={{ ...input, minHeight: 60, resize: 'vertical' }}
            aria-label={t('farmer.newreq.note', 'Anything else (optional)')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </label>
      </div>
    </Modal>
  );
}
