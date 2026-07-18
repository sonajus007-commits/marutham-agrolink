import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Field, Input, Select, Sheet, FIELD_ERR_CLASS } from '@marutham/ui';
import { api, type ListingPayload } from '@marutham/api-client';
import {
  MAX_BULK_DISC_PCT,
  cutoffSlots,
  cutoffTimestamp,
  type CutoffSlot,
  listingProblemKey,
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
    /* Deliberately NOT defaulted: the cutoff is mandatory and the valid choices
       depend on the time of day, so the sheet seeds it from the live window once
       it opens (keeping the saved one only if it is still on offer). */
    time_available: l.time_available || '',
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
  const { t } = useTranslation();
  const toast = useToast();

  /* The choosable cutoffs, generated in IST from the moment the sheet opened.
   * Held in state rather than recomputed each render so the list cannot shift
   * under the seller mid-edit (it would, on the hour). */
  const [slots, setSlots] = useState<CutoffSlot[]>(() => cutoffSlots());
  const [draft, setDraft] = useState<ListingDraft>(() => draftFrom(listing));
  const [images, setImages] = useState<string[]>(listing.images || []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const fresh = cutoffSlots();
    setSlots(fresh);
    const d = draftFrom(listing);
    /* A saved cutoff survives only while it is still on offer. Once it has passed
       — the usual case for a listing being re-listed the next day — it is cleared
       so the seller has to choose from the live window, rather than saving a time
       that already went by. */
    if (!fresh.some((sl) => sl.value === d.time_available)) d.time_available = '';
    setDraft(d);
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
    // The code becomes a sentence here; `max` is passed rather than written into
    // the copy, so the cap and the wording cannot drift in two languages.
    if (problem) return setError(t(listingProblemKey(problem), { max: MAX_BULK_DISC_PCT }));
    setError(null);

    const cutoff_ts = cutoffTimestamp(draft.time_available);
    if (!cutoff_ts) return setError(t('listing.err.cutoff'));

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
      toast(t('farmer.form.saved', 'Listing saved — customers can order it now.'), 'ok');
      onSaved();
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : t('farmer.form.saveFailed', 'Could not save the listing');
      setError(msg);
      toast(msg, 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={listing.product?.name ?? t('farmer.form.listing', 'Listing')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      <Field label={t('farmer.form.product', 'Product')}>
        {(p) => <Input {...p} value={listing.product?.name || ''} readOnly />}
      </Field>

      <Field
        label={t('farmer.form.price', 'Your selling price (₹ per {{unit}})', { unit })}
        required
      >
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
          <strong>
            {t('farmer.form.customerPays', 'Customer pays {{amount}}', {
              amount: fmtMoney(preview.consumerPrice),
            })}
          </strong>{' '}
          / {unit}
          <span className="price-preview__break">
            {t('farmer.form.priceBreak', 'your {{amount}} + {{pct}}% platform fee', {
              amount: fmtMoney(preview.farmerPrice),
              pct: preview.feePct,
            })}
            {handling > 0
              ? ` + ${t('farmer.form.plusHandling', '{{amount}} handling', { amount: fmtMoney(handling) })}`
              : ''}
          </span>
          {bulk ? (
            <span className="price-preview__bulk">
              {t(
                'farmer.form.bulkPreview',
                'Bulk {{qty}}+ {{unit}}: you get {{yours}} → customer pays {{theirs}}',
                {
                  qty: bulk.bulkQty,
                  unit,
                  yours: fmtMoney(bulk.farmerPrice),
                  theirs: fmtMoney(bulk.consumerPrice),
                },
              )}
            </span>
          ) : null}
        </div>
      ) : null}

      <Field label={t('farmer.form.qty', 'Quantity available ({{unit}})', { unit })} required>
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
        label={t('farmer.form.cutoff', 'Stop taking orders at')}
        required
        hint={t(
          'farmer.form.cutoffHint',
          'Orders close at this time. Choose any hour from now until 8 AM (IST).',
        )}
      >
        {(p) => (
          <Select
            {...p}
            value={draft.time_available}
            onChange={(e) => set('time_available', e.target.value)}
          >
            {/* Mandatory, and never pre-answered: the seller states their own
                selling window rather than inheriting a default they did not read. */}
            <option value="">{t('farmer.cutoff.choose', '— Select a time —')}</option>
            {/* The day string is a VALUE the options are filtered by — only its
                heading is translated. */}
            {(['today', 'tomorrow'] as const).map((day) => {
              const inDay = slots.filter((sl) => sl.day === day);
              if (!inDay.length) return null;
              return (
                <optgroup
                  key={day}
                  label={
                    day === 'today'
                      ? t('farmer.cutoff.groupToday', 'Today')
                      : t('farmer.cutoff.groupTomorrow', 'Tomorrow')
                  }
                >
                  {inDay.map((sl) => (
                    <option key={sl.value} value={sl.value}>
                      {sl.time}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </Select>
        )}
      </Field>

      <fieldset className="lf-group">
        <legend>
          {t('farmer.form.bulkOffer', 'Bulk offer')}{' '}
          <span className="lf-optional">({t('common.optional', 'optional')})</span>
        </legend>
        <div className="lf-row">
          <Field label={t('farmer.form.buyAtLeast', 'Buy at least ({{unit}})', { unit })}>
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
          <Field label={t('farmer.form.discount', 'Discount (%)')}>
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
          {t('farmer.form.orderRule', 'Order rule')}{' '}
          <span className="lf-optional">({t('common.optional', 'optional')})</span>
        </legend>
        <div className="lf-row">
          <Field label={t('farmer.form.ruleType', 'Type')}>
            {(p) => (
              <Select
                {...p}
                value={draft.qty_type || ''}
                onChange={(e) => set('qty_type', e.target.value as 'MOQ' | 'SPQ' | '')}
              >
                <option value="">— {t('farmer.form.ruleNone', 'None')} —</option>
                <option value="MOQ">{t('farmer.form.ruleMoq', 'Minimum order')}</option>
                <option value="SPQ">{t('farmer.form.ruleSpq', 'Fixed pack size')}</option>
              </Select>
            )}
          </Field>
          <Field label={t('farmer.form.ruleAmount', 'Amount ({{unit}})', { unit })}>
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
            ? t('farmer.form.spqHint', 'Sold in fixed packs — e.g. a 5-piece lemon pack.')
            : t(
                'farmer.form.moqHint',
                'The smallest amount a customer must buy — e.g. 1 bunch minimum.',
              )}
        </p>
      </fieldset>

      <Field label={t('farmer.form.photos', 'Photos')}>
        {() => <ImagePicker images={images} onChange={setImages} onError={(m) => toast(m, 'er')} />}
      </Field>

      {error ? (
        <div className={FIELD_ERR_CLASS} role="alert" style={{ marginBottom: 8 }}>
          {error}
        </div>
      ) : null}

      <div className="prof-actions">
        <Button onClick={save} disabled={busy}>
          {busy ? t('consumer.addr.saving', 'Saving…') : t('farmer.form.saveList', 'Save & list')}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          {t('common.cancel', 'Cancel')}
        </Button>
      </div>
    </Sheet>
  );
}

/** Digits and at most one decimal point. Kept as a string so "3." survives typing. */
function numeric(v: string): string {
  return v.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1');
}
