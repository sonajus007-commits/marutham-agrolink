import { Button } from '@marutham/ui';
import {
  getProductEmoji,
  listingPriceRs,
  listingState,
  fmtMoney,
  type FarmerListing,
  type ListingState,
} from '@marutham/lib';

const STATE_BADGE: Record<ListingState, { text: string; cls: string }> = {
  pending: { text: '⏳ Pending approval', cls: 'is-pending' },
  rejected: { text: '❌ Rejected', cls: 'is-rejected' },
  needs_price: { text: '✅ Approved', cls: 'is-approved' },
  cutoff_passed: { text: '✅ Approved', cls: 'is-approved' },
  listed: { text: '✅ Approved', cls: 'is-approved' },
  confirmed: { text: '✅ Approved', cls: 'is-approved' },
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
        <span className={`listing__badge ${badge.cls}`}>{badge.text}</span>
        {priced && listing.qty_available != null ? (
          <span className="listing__tag">
            {listing.qty_available} {unit} available
          </span>
        ) : null}
        {priced && listing.time_available ? (
          <span className="listing__tag listing__tag--cutoff">
            Order by {listing.time_available}
          </span>
        ) : null}
        {priced && listing.bulk_qty && listing.bulk_disc_pct ? (
          <span className="listing__tag listing__tag--bulk">
            Bulk {listing.bulk_qty}+ → {listing.bulk_disc_pct}% off
          </span>
        ) : null}
        {state === 'confirmed' ? (
          <span className="listing__tag listing__tag--ok">Confirmed for delivery</span>
        ) : null}
        {state === 'cutoff_passed' ? (
          <span className="listing__tag listing__tag--warn">Cutoff passed</span>
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
  const remove = (
    <button className="listing__link listing__link--danger" onClick={onDelete} disabled={busy}>
      {state === 'pending' ? 'Cancel request' : 'Remove'}
    </button>
  );

  switch (state) {
    case 'pending':
      return (
        <>
          <span className="listing__note">Awaiting admin approval</span>
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
          <span className="listing__note">{reason || 'Contact support for details.'}</span>
          {remove}
        </>
      );

    case 'needs_price':
      return (
        <>
          <Button onClick={onEdit} disabled={busy} style={{ padding: '6px 12px', fontSize: 11 }}>
            💰 Set selling price
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
            Update price &amp; re-list
          </Button>
          {remove}
        </>
      );

    case 'listed':
      return (
        <>
          <Button onClick={onConfirm} disabled={busy} style={{ padding: '6px 12px', fontSize: 11 }}>
            Confirm for tomorrow
          </Button>
          <button className="listing__link" onClick={onEdit} disabled={busy}>
            Edit
          </button>
          {remove}
        </>
      );

    case 'confirmed':
      return (
        <>
          <button className="listing__link" onClick={onEdit} disabled={busy}>
            Edit
          </button>
          <button className="listing__link" onClick={onUnconfirm} disabled={busy}>
            Undo confirm
          </button>
          {remove}
        </>
      );
  }
}
