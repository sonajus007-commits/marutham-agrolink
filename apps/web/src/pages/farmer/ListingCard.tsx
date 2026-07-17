import { useTranslation } from 'react-i18next';
import { Button } from '@marutham/ui';
import {
  getProductEmoji,
  listingPriceRs,
  listingState,
  fmtMoney,
  type FarmerListing,
  type ListingState,
} from '@marutham/lib';

/* listingState() already returns a CODE, so the badge only ever needed a label.
 * [icon, key, English, class] — the English travels with the key as the default. */
const STATE_BADGE: Record<ListingState, { icon: string; key: string; en: string; cls: string }> = {
  pending: { icon: '⏳', key: 'farmer.listing.pending', en: 'Pending approval', cls: 'is-pending' },
  rejected: { icon: '❌', key: 'farmer.listing.rejected', en: 'Rejected', cls: 'is-rejected' },
  needs_price: { icon: '✅', key: 'farmer.listing.approved', en: 'Approved', cls: 'is-approved' },
  cutoff_passed: { icon: '✅', key: 'farmer.listing.approved', en: 'Approved', cls: 'is-approved' },
  listed: { icon: '✅', key: 'farmer.listing.approved', en: 'Approved', cls: 'is-approved' },
  confirmed: { icon: '✅', key: 'farmer.listing.approved', en: 'Approved', cls: 'is-approved' },
};

export function ListingCard({
  listing,
  busy,
  onEdit,
  onConfirm,
  onUnconfirm,
  onDelete,
}: {
  listing: FarmerListing;
  busy: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const state = listingState(listing);
  const p = listing.product;
  const unit = p?.unit || '';
  const price = listingPriceRs(listing);
  const badge = STATE_BADGE[state];
  const priced = state !== 'pending' && state !== 'rejected' && state !== 'needs_price';

  return (
    <article className="listing">
      <div className="listing__top">
        <div className="listing__thumb" aria-hidden="true">
          {listing.images?.[0] ? (
            <img src={listing.images[0]} alt="" />
          ) : (
            getProductEmoji(p?.name || '')
          )}
        </div>
        <div className="listing__id">
          <div className="listing__name">{p?.name || '—'}</div>
          {p?.regional_name ? <div className="listing__regional">{p.regional_name}</div> : null}
          {p?.product_group ? <span className="listing__chip">{p.product_group}</span> : null}
        </div>
        {priced ? (
          <div className="listing__pricebox">
            <div className="listing__price">{fmtMoney(price)}</div>
            <div className="listing__unit">/ {unit}</div>
          </div>
        ) : null}
      </div>

      <div className="listing__badges">
        <span className={`listing__badge ${badge.cls}`}>
          {badge.icon} {t(badge.key, badge.en)}
        </span>
        {priced && listing.qty_available != null ? (
          <span className="listing__tag">
            {t('farmer.listing.available', '{{qty}} {{unit}} available', {
              qty: listing.qty_available,
              unit,
            })}
          </span>
        ) : null}
        {priced && listing.time_available ? (
          <span className="listing__tag listing__tag--cutoff">
            {t('consumer.card.orderBy', 'Order by {{time}}', { time: listing.time_available })}
          </span>
        ) : null}
        {priced && listing.bulk_qty && listing.bulk_disc_pct ? (
          <span className="listing__tag listing__tag--bulk">
            {t('consumer.card.bulk', 'Bulk {{qty}}+ → {{pct}}% off', {
              qty: listing.bulk_qty,
              pct: listing.bulk_disc_pct,
            })}
          </span>
        ) : null}
        {state === 'confirmed' ? (
          <span className="listing__tag listing__tag--ok">
            {t('farmer.listing.confirmedTag', 'Confirmed for delivery')}
          </span>
        ) : null}
        {state === 'cutoff_passed' ? (
          <span className="listing__tag listing__tag--warn">
            {t('farmer.listing.cutoffPassed', 'Cutoff passed')}
          </span>
        ) : null}
      </div>

      <div className="listing__actions">
        <Actions
          state={state}
          reason={listing.rejection_reason}
          busy={busy}
          onEdit={onEdit}
          onConfirm={onConfirm}
          onUnconfirm={onUnconfirm}
          onDelete={onDelete}
        />
      </div>
    </article>
  );
}

function Actions({
  state,
  reason,
  busy,
  onEdit,
  onConfirm,
  onUnconfirm,
  onDelete,
}: {
  state: ListingState;
  /** The admin's reason for declining, shown to the seller verbatim. Populated for
   *  every rejection made since 025_listing_rejection_reason.sql; rejections made
   *  BEFORE it have none, because the old backend discarded what the admin typed. */
  reason?: string | null;
  busy: boolean;
  onEdit: () => void;
  onConfirm: () => void;
  onUnconfirm: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const remove = (
    <button className="listing__link listing__link--danger" onClick={onDelete} disabled={busy}>
      {state === 'pending'
        ? t('farmer.listing.cancelRequest', 'Cancel request')
        : t('farmer.listing.remove', 'Remove')}
    </button>
  );

  switch (state) {
    case 'pending':
      return (
        <>
          <span className="listing__note">
            {t('farmer.listing.awaiting', 'Awaiting admin approval')}
          </span>
          {remove}
        </>
      );

    case 'rejected':
      return (
        <>
          {/* The reason IS the rejection, as far as the seller is concerned: it is
              the only part they can act on. The fallback survives for rows rejected
              before the reason was stored — a new rejection cannot reach it, because
              the server refuses one without a reason. */}
          {/* The reason is the ADMIN's own words, stored on the row — shown verbatim,
              never translated. Only our fallback is ours to say. */}
          <span className="listing__note">
            {reason || t('farmer.listing.noReason', 'Contact support for details.')}
          </span>
          {remove}
        </>
      );

    case 'needs_price':
      return (
        <>
          <Button onClick={onEdit} disabled={busy} style={{ padding: '6px 12px', fontSize: 11 }}>
            💰 {t('farmer.listing.setPrice', 'Set selling price')}
          </Button>
          {remove}
        </>
      );

    case 'cutoff_passed':
      return (
        <>
          <Button
            onClick={onEdit}
            disabled={busy}
            className="listing__btn--warn"
            style={{ padding: '6px 12px', fontSize: 11 }}
          >
            {t('farmer.listing.relist', 'Update price & re-list')}
          </Button>
          {remove}
        </>
      );

    case 'listed':
      return (
        <>
          <Button onClick={onConfirm} disabled={busy} style={{ padding: '6px 12px', fontSize: 11 }}>
            {t('farmer.listing.confirmTomorrow', 'Confirm for tomorrow')}
          </Button>
          <button className="listing__link" onClick={onEdit} disabled={busy}>
            {t('consumer.addr.edit', 'Edit')}
          </button>
          {remove}
        </>
      );

    case 'confirmed':
      return (
        <>
          <button className="listing__link" onClick={onEdit} disabled={busy}>
            {t('consumer.addr.edit', 'Edit')}
          </button>
          <button className="listing__link" onClick={onUnconfirm} disabled={busy}>
            {t('farmer.listing.undoConfirm', 'Undo confirm')}
          </button>
          {remove}
        </>
      );
  }
}
