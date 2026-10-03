import { useTranslation } from 'react-i18next';
import { acceptMinutesLeft, sellerDeclineNote, sellerRejectKind, type Order } from '@marutham/lib';

/**
 * The one-line notes a seller order row carries in the split views (Home tiles
 * and the Orders tab): the accept countdown on a new order, and who rejected a
 * cancelled one. Kept in one place so both screens say the same thing.
 */
export function useSellerOrderNotes() {
  const { t } = useTranslation();

  const acceptNote = (o: Order) => {
    const mins = acceptMinutesLeft(o);
    if (mins === null) return null;
    return (
      <span className="text-warning-fg">
        {mins > 0
          ? t('farmer.orders.acceptIn', '⏱ Accept within {{mins}} min', { mins })
          : t('farmer.orders.acceptClosing', '⏱ Accept now — window closing')}
      </span>
    );
  };

  const rejectNote = (o: Order) => {
    const kind = sellerRejectKind(o);
    if (kind === 'declined') {
      const why = sellerDeclineNote(o);
      return (
        <span className="text-fg-muted">
          {t('farmer.orders.rejDeclined', 'Declined by you')}
          {why ? ` — ${why}` : ''}
        </span>
      );
    }
    return (
      <span className={kind === 'missed' ? 'text-danger' : 'text-fg-muted'}>
        {kind === 'missed'
          ? t('farmer.orders.rejMissed', 'Not accepted in time — auto-cancelled')
          : t('farmer.orders.rejOther', 'Cancelled by the customer or Marutham')}
      </span>
    );
  };

  return { acceptNote, rejectNote };
}
