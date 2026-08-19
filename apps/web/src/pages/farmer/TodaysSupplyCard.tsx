import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  cutoffSlots,
  cutoffTimestamp,
  fmtMoney,
  getProductEmoji,
  listingPriceRs,
  listingState,
  needsSupplyConfirm,
  projectConsumerPrice,
  todaysSupplyListings,
  type CutoffSlot,
  type FarmerListing,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { ImagePicker } from '../../components/ImagePicker';

/** One editable row of the daily to-do, keyed by listing id. */
type Row = { checked: boolean; qty: string; price: string; cutoff: string };

/**
 * "Confirm today's supply" — the daily one-tap panel on the farmer dashboard.
 *
 * The overnight reset clears `listed`/`confirmed` on every priced listing, so
 * each market day the seller must re-list and confirm what they are bringing to
 * market. This collapses that repetitive per-card chore into a single table:
 * every already-approved, priced product (staples included — it is NOT filtered
 * by how recently the product was registered) in a row with its quantity,
 * selling price, the fee-adjusted price the customer pays (read-only, live),
 * the order cut-off time and its photos — confirmed together in one tap. It
 * touches nothing in the admin approval path — pending / needs-price / rejected
 * rows never appear.
 */
export function TodaysSupplyCard({
  listings,
  onReload,
}: {
  listings: FarmerListing[];
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // The choosable cut-off times, generated in IST when the card mounted. Held in
  // state so the list cannot shift under the seller mid-edit (it would, on the hour).
  const [slots] = useState<CutoffSlot[]>(() => cutoffSlots());
  const defaultCutoff = slots.length ? slots[slots.length - 1].value : '';

  // Every approved, priced product; the unconfirmed ones are today's to-do.
  const supply = useMemo(() => todaysSupplyListings(listings), [listings]);
  const pending = useMemo(() => supply.filter(needsSupplyConfirm), [supply]);
  const doneCount = supply.length - pending.length;

  // Per-row editable state, seeded from the last saved quantity, price and cut-off.
  // Re-seeded whenever the pending set changes (a reload).
  const [rows, setRows] = useState<Record<string, Row>>({});
  const seedKey = pending.map((l) => l.id).join(',');
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (seededFor !== seedKey) {
    const next: Record<string, Row> = {};
    for (const l of pending) {
      const saved = l.time_available || '';
      next[l.id] = {
        checked: true,
        qty: l.qty_available != null && l.qty_available > 0 ? String(l.qty_available) : '',
        price: String(listingPriceRs(l) || ''),
        // Keep a saved cut-off only while it is still on offer; otherwise fall
        // back to the latest slot (the 8 AM close) rather than a time gone by.
        cutoff: slots.some((s) => s.value === saved) ? saved : defaultCutoff,
      };
    }
    setRows(next);
    setSeededFor(seedKey);
  }

  // The listing whose photos are being edited, plus its working image set.
  const [photoFor, setPhotoFor] = useState<FarmerListing | null>(null);
  const [photoImages, setPhotoImages] = useState<string[]>([]);

  // Nothing approved & priced yet — no daily chore, so no card at all.
  if (supply.length === 0) return null;

  const patch = (id: string, part: Partial<Row>) =>
    setRows((r) => ({ ...r, [id]: { ...r[id], ...part } }));

  const selected = pending.filter((l) => rows[l.id]?.checked);
  // A row can be confirmed only once it has a real quantity, a real selling price
  // and a cut-off — a blank price must never fall back to yesterday's silently.
  const rowReady = (l: FarmerListing) => {
    const r = rows[l.id];
    return !!r && Number(r.qty) > 0 && Number(r.price) > 0 && !!r.cutoff;
  };
  const readyCount = selected.filter(rowReady).length;

  function openPhotos(l: FarmerListing) {
    setPhotoFor(l);
    setPhotoImages(l.images || []);
  }

  // Persist photos only if they changed, then refresh so both this card and the
  // My Products view show the new image.
  async function closePhotos() {
    const l = photoFor;
    setPhotoFor(null);
    if (!l) return;
    if (JSON.stringify(photoImages) === JSON.stringify(l.images || [])) return;
    try {
      await api.updateListing(l.id, { images: photoImages });
      toast(t('farmer.supply.photoSaved', 'Photo updated.'), 'ok');
      onReload();
    } catch {
      toast(t('farmer.supply.photoFailed', 'Could not save that photo.'), 'er');
    }
  }

  async function confirmAll() {
    const targets = selected.filter(rowReady);
    if (targets.length === 0) {
      toast(
        t(
          'farmer.supply.needQtyPrice',
          'Enter a quantity and selling price for at least one product.',
        ),
        'er',
      );
      return;
    }

    // Each row carries its own cut-off; a wrong device clock yields a null
    // timestamp, and we must refuse rather than write a bad one (cutoffTimestamp).
    const withTs = targets.map((l) => ({ l, cutoff_ts: cutoffTimestamp(rows[l.id].cutoff) }));
    if (withTs.some((x) => !x.cutoff_ts)) {
      toast(
        t('farmer.supply.clockErr', 'Your device clock looks wrong — cannot set today’s cutoff.'),
        'er',
      );
      return;
    }

    setBusy(true);
    // Re-list AND confirm in a single PATCH per product: the existing endpoint
    // accepts fresh qty/price/cut-off alongside both flags, so today's stock is
    // never published stale or at zero.
    const results = await Promise.allSettled(
      withTs.map(({ l, cutoff_ts }) =>
        api.updateListing(l.id, {
          qty_available: Number(rows[l.id].qty),
          farmer_price: Number(rows[l.id].price),
          time_available: rows[l.id].cutoff,
          cutoff_ts: cutoff_ts as string,
          listed: true,
          confirmed: true,
        }),
      ),
    );
    setBusy(false);

    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok > 0) {
      toast(
        t('farmer.supply.confirmed', '{{count}} product(s) confirmed for today’s market.', {
          count: ok,
        }),
        'ok',
      );
    }
    if (failed > 0) {
      toast(
        t('farmer.supply.someFailed', '{{count}} could not be confirmed — please try again.', {
          count: failed,
        }),
        'er',
      );
    }
    onReload();
  }

  return (
    <section className="fm-supply" aria-label={t('farmer.supply.title', 'Confirm today’s supply')}>
      <div className="fm-supply__head">
        <h2 className="fm-section-title">
          🧺 {t('farmer.supply.title', 'Confirm today’s supply')}
        </h2>
        {doneCount > 0 ? (
          <span className="fm-supply__done">
            ✅ {t('farmer.supply.doneCount', '{{count}} confirmed', { count: doneCount })}
          </span>
        ) : null}
      </div>

      {pending.length === 0 ? (
        <p className="fm-note">
          {t('farmer.supply.allDone', 'All your products are confirmed for today’s market. 🎉')}
        </p>
      ) : (
        <>
          <p className="fm-supply__sub">
            {t(
              'farmer.supply.sub',
              'Tick what you are bringing to market today, set the quantity, then confirm — customers can order it right away.',
            )}
          </p>

          <div className="fm-supply__scroll">
            <table className="fm-supply__table">
              <thead>
                <tr>
                  <th
                    className="fm-supply__pick"
                    aria-label={t('farmer.supply.include', 'Include')}
                  >
                    ✓
                  </th>
                  <th>{t('farmer.supply.colProduct', 'Products')}</th>
                  <th>{t('farmer.supply.colQty', 'Available Quantity')}</th>
                  <th>{t('farmer.supply.colPrice', 'My Selling Price')}</th>
                  <th>{t('farmer.supply.colCustomer', 'Customer Pays')}</th>
                  <th>{t('farmer.supply.colCutoff', 'Order Cut-off Time')}</th>
                  <th>{t('farmer.supply.colPhotos', 'Images')}</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((l) => {
                  const row = rows[l.id];
                  if (!row) return null;
                  const name = l.product?.name || '—';
                  const unit = l.product?.unit || '';
                  const stale = listingState(l) === 'cutoff_passed';
                  const priceNum = Number(row.price);
                  const customerPays =
                    priceNum > 0
                      ? fmtMoney(projectConsumerPrice(priceNum, user?.seller_type).consumerPrice)
                      : '—';
                  const photoCount = l.images?.length || 0;
                  return (
                    <tr key={l.id} className={row.checked ? 'is-on' : ''}>
                      <td className="fm-supply__pick">
                        <input
                          type="checkbox"
                          aria-label={t('farmer.supply.includeName', 'Include {{name}}', { name })}
                          checked={row.checked}
                          onChange={(e) => patch(l.id, { checked: e.target.checked })}
                        />
                      </td>

                      <td className="fm-supply__prod">
                        <span className="fm-supply__emoji" aria-hidden="true">
                          {getProductEmoji(name)}
                        </span>
                        <span className="fm-supply__pname">
                          {name}
                          {unit ? <span className="fm-supply__unit">/ {unit}</span> : null}
                          {stale ? (
                            <span className="fm-supply__stale">
                              {t('farmer.supply.stale', 'from yesterday')}
                            </span>
                          ) : null}
                        </span>
                      </td>

                      <td>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          className="fm-supply__input"
                          aria-label={t('farmer.supply.colQty', 'Available Quantity')}
                          placeholder={t('farmer.supply.qtyPh', 'Qty')}
                          value={row.qty}
                          disabled={!row.checked}
                          onChange={(e) => patch(l.id, { qty: e.target.value })}
                        />
                      </td>

                      <td>
                        <span className="fm-supply__money">
                          <span aria-hidden="true">₹</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            className="fm-supply__input"
                            aria-label={t('farmer.supply.colPrice', 'My Selling Price')}
                            value={row.price}
                            disabled={!row.checked}
                            onChange={(e) => patch(l.id, { price: e.target.value })}
                          />
                        </span>
                      </td>

                      <td
                        className="fm-supply__pays"
                        title={t('farmer.supply.paysHint', 'Your price + platform fee')}
                      >
                        {customerPays}
                      </td>

                      <td>
                        <select
                          className="fm-supply__select"
                          aria-label={t('farmer.supply.colCutoff', 'Order Cut-off Time')}
                          value={row.cutoff}
                          disabled={!row.checked}
                          onChange={(e) => patch(l.id, { cutoff: e.target.value })}
                        >
                          {(['today', 'tomorrow'] as const).map((day) => {
                            const inDay = slots.filter((s) => s.day === day);
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
                                {inDay.map((s) => (
                                  <option key={s.value} value={s.value}>
                                    {s.time}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="fm-supply__photobtn"
                          onClick={() => openPhotos(l)}
                        >
                          📷 {t('farmer.supply.photosBtn', 'Photos')}
                          {photoCount > 0 ? ` (${photoCount})` : ''}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="fm-supply__actions">
            <Button onClick={confirmAll} disabled={busy || readyCount === 0}>
              {busy
                ? t('farmer.supply.confirming', 'Confirming…')
                : t('farmer.supply.confirmBtn', 'List & confirm {{count}} for today', {
                    count: readyCount,
                  })}
            </Button>
          </div>
        </>
      )}

      <Modal
        open={photoFor !== null}
        title={t('farmer.supply.photoTitle', '{{name}} — photos', {
          name: photoFor?.product?.name ?? '',
        })}
        onClose={() => void closePhotos()}
        closeLabel={t('farmer.supply.done', 'Done')}
        footer={
          <Button onClick={() => void closePhotos()}>{t('farmer.supply.done', 'Done')}</Button>
        }
      >
        <ImagePicker
          images={photoImages}
          onChange={setPhotoImages}
          onError={(m) => toast(m, 'er')}
        />
      </Modal>
    </section>
  );
}
