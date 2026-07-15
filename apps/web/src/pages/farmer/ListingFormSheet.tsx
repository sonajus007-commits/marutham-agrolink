import { useEffect, useState } from 'react';
import { Button, Field, Input, Select, Sheet, FIELD_ERR_CLASS } from '@marutham/ui';
import { api, type ListingPayload } from '@marutham/api-client';
import {
  CUTOFF_OPTIONS,
  DEFAULT_CUTOFF,
  cutoffTimestamp,
  cutoffLabel,
  projectBulkPrice,
  projectConsumerPrice,
  validateListing,
  listingPriceRs,
  fmtMoney,
  type FarmerListing,
  type ListingDraft,
  type Product,
  type SellerType,
} from '@marutham/lib';
import { useToast } from '../../components/Toast';
import { ImagePicker } from '../../components/ImagePicker';

function draftFrom(l: FarmerListing): ListingDraft {
  return {
    product_id: l.product?.id || l.product_id,
    farmer_price: listingPriceRs(l) || '',
    qty_available: l.qty_available ?? '',
    time_available: l.time_available || DEFAULT_CUTOFF,
    bulk_qty: l.bulk_qty ?? '',
    bulk_disc_pct: l.bulk_disc_pct ?? '',
    qty_type: l.qty_type ?? '',
    qty_value: l.qty_value ?? '',
  };
}

/**
 * Price and stock an approved listing.
 *
 * Always an edit. farmer_listings is unique on (farmer_id, product_id) and the
 * row is created when the seller requests the product, so there is no path that
 * inserts a second one — POST would 409.
 */
export function ListingFormSheet({
  open,
  listing,
  product,
  sellerType,
  onClose,
  onSaved,
}: {
  open: boolean;
  listing: FarmerListing;
  /** The catalogue product, for unit + district handling. */
  product: Product | null;
  sellerType: SellerType | null | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ListingDraft>(() => draftFrom(listing));
  const [images, setImages] = useState<string[]>(listing.images || []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(draftFrom(listing));
    setImages(listing.images || []);
    setError(null);
  }, [open, listing]);

  const set = <K extends keyof ListingDraft>(k: K, v: ListingDraft[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const unit = product?.unit || listing.product?.unit || 'unit';
  const handling = product?.district_price
    ? parseFloat(String(product.district_price.handling)) || 0
    : 0;

  const price = Number(draft.farmer_price);
  const preview = price > 0 ? projectConsumerPrice(price, sellerType, handling) : null;
  const bulk =
    price > 0
      ? projectBulkPrice(
          price,
          sellerType,
          Number(draft.bulk_qty || 0),
          Number(draft.bulk_disc_pct || 0),
          handling,
        )
      : null;

  async function save() {
    const problem = validateListing(draft);
    if (problem) return setError(problem);
    setError(null);

    const cutoff_ts = cutoffTimestamp(draft.time_available);
    if (!cutoff_ts) return setError('Choose when orders should stop.');

    const hasBulk = Number(draft.bulk_qty) > 0 && Number(draft.bulk_disc_pct) > 0;
    const hasQtyRule = Number(draft.qty_value) > 0;

    // farmer_price is RUPEES here; the api-client converts to paise.
    const payload: ListingPayload = {
      farmer_price: Number(draft.farmer_price),
      qty_available: Number(draft.qty_available),
      time_available: draft.time_available,
      cutoff_ts,
      bulk_qty: hasBulk ? Number(draft.bulk_qty) : null,
      bulk_disc_pct: hasBulk ? Number(draft.bulk_disc_pct) : null,
      qty_type: hasQtyRule ? (draft.qty_type as 'MOQ' | 'SPQ') : null,
      qty_value: hasQtyRule ? Number(draft.qty_value) : null,
      images,
      listed: true,
    };

    setBusy(true);
    try {
      await api.updateListing(listing.id, payload);
      toast('Listing saved — customers can order it now.', 'ok');
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not save the listing';
      setError(msg);
      toast(msg, 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title={listing.product?.name ?? 'Listing'} onClose={onClose}>
      <Field label="Product">
        {(p) => <Input {...p} value={listing.product?.name || ''} readOnly />}
      </Field>

      <Field label={`Your selling price (₹ per ${unit})`} required>
        {(p) => (
          <Input
            {...p}
            type="text"
            inputMode="decimal"
            placeholder="30"
            value={draft.farmer_price}
            onChange={(e) => set('farmer_price', numeric(e.target.value))}
          />
        )}
      </Field>

      {preview ? (
        <div className="price-preview">
          <strong>Customer pays {fmtMoney(preview.consumerPrice)}</strong> / {unit}
          <span className="price-preview__break">
            your {fmtMoney(preview.farmerPrice)} + {preview.feePct}% platform fee
            {handling > 0 ? ` + ${fmtMoney(handling)} handling` : ''}
          </span>
          {bulk ? (
            <span className="price-preview__bulk">
              Bulk {bulk.bulkQty}+ {unit}: you get {fmtMoney(bulk.farmerPrice)} → customer pays{' '}
              {fmtMoney(bulk.consumerPrice)}
            </span>
          ) : null}
        </div>
      ) : null}

      <Field label={`Quantity available (${unit})`} required>
        {(p) => (
          <Input
            {...p}
            type="text"
            inputMode="decimal"
            placeholder="10"
            value={draft.qty_available}
            onChange={(e) => set('qty_available', numeric(e.target.value))}
          />
        )}
      </Field>

      <Field
        label="Stop taking orders at"
        required
        hint="Orders close at this time; you re-list the next day."
      >
        {(p) => (
          <Select
            {...p}
            value={draft.time_available}
            onChange={(e) => set('time_available', e.target.value)}
          >
            {(['Previous Evening', 'Current Day'] as const).map((group) => (
              <optgroup key={group} label={group}>
                {CUTOFF_OPTIONS.filter((o) => o.group === group).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
            {/* A value stored before the option list changed must not be silently
                rewritten to the first option when the seller opens the form. */}
            {CUTOFF_OPTIONS.some((o) => o.value === draft.time_available) ? null : (
              <option value={draft.time_available}>{cutoffLabel(draft.time_available)}</option>
            )}
          </Select>
        )}
      </Field>

      <fieldset className="lf-group">
        <legend>
          Bulk offer <span className="lf-optional">(optional)</span>
        </legend>
        <div className="lf-row">
          <Field label={`Buy at least (${unit})`}>
            {(p) => (
              <Input
                {...p}
                type="text"
                inputMode="decimal"
                value={draft.bulk_qty}
                onChange={(e) => set('bulk_qty', numeric(e.target.value))}
              />
            )}
          </Field>
          <Field label="Discount (%)">
            {(p) => (
              <Input
                {...p}
                type="text"
                inputMode="decimal"
                value={draft.bulk_disc_pct}
                onChange={(e) => set('bulk_disc_pct', numeric(e.target.value))}
              />
            )}
          </Field>
        </div>
      </fieldset>

      <fieldset className="lf-group">
        <legend>
          Order rule <span className="lf-optional">(optional)</span>
        </legend>
        <div className="lf-row">
          <Field label="Type">
            {(p) => (
              <Select
                {...p}
                value={draft.qty_type || ''}
                onChange={(e) => set('qty_type', e.target.value as 'MOQ' | 'SPQ' | '')}
              >
                <option value="">— None —</option>
                <option value="MOQ">Minimum order</option>
                <option value="SPQ">Fixed pack size</option>
              </Select>
            )}
          </Field>
          <Field label={`Amount (${unit})`}>
            {(p) => (
              <Input
                {...p}
                type="text"
                inputMode="decimal"
                value={draft.qty_value}
                onChange={(e) => set('qty_value', numeric(e.target.value))}
              />
            )}
          </Field>
        </div>
        <p className="lf-hint">
          {draft.qty_type === 'SPQ'
            ? 'Sold in fixed packs — e.g. a 5-piece lemon pack.'
            : 'The smallest amount a customer must buy — e.g. 1 bunch minimum.'}
        </p>
      </fieldset>

      <Field label="Photos">
        {() => <ImagePicker images={images} onChange={setImages} onError={(m) => toast(m, 'er')} />}
      </Field>

      {error ? (
        <div className={FIELD_ERR_CLASS} role="alert" style={{ marginBottom: 8 }}>
          {error}
        </div>
      ) : null}

      <div className="prof-actions">
        <Button onClick={save} disabled={busy}>
          {busy ? 'Saving…' : 'Save & list'}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
}

/** Digits and at most one decimal point. Kept as a string so "3." survives typing. */
function numeric(v: string): string {
  return v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}
