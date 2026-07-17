import { useTranslation } from 'react-i18next';
import {
  fmtDateShort,
  fmtMoney,
  isOrderCancelled,
  payMethodKey,
  statusColor,
  statusKey,
  type Order,
} from '@marutham/lib';

/** Short human handle for an order — the code, or a truncated id for old rows. */
export function orderLabel(o: Order): string {
  return o.code || o.id.slice(0, 8).toUpperCase();
}

/**
 * Compact tappable order row, shared by the Home "past orders" list and the
 * Orders tab. A real <button> so it is keyboard- and screen-reader-reachable —
 * the legacy markup put onclick on a <div>.
 */
export function OrderRow({ order, onOpen }: { order: Order; onOpen: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  /* The English status stays the value — statusColor keys off it. Only the
   * spoken version is translated. */
  const status = isOrderCancelled(order) ? 'Cancelled' : String(order.status ?? '');
  return (
    <button type="button" className="ord-item" onClick={() => onOpen(order.id)}>
      <span
        className="ord-item__bar"
        style={{ background: statusColor(status) }}
        aria-hidden="true"
      />
      <span className="ord-item__main">
        <span className="ord-id">{orderLabel(order)}</span>
        <span className="ord-loc">
          {t(statusKey(status), status)} · {fmtDateShort(order.created_at, i18n.language)}
        </span>
      </span>
      <span className="ord-item__right">
        <span className="ord-amt">{fmtMoney(order.total)}</span>
        {order.pay_method ? (
          <span className="ord-item__pay">
            {t(payMethodKey(order.pay_method), order.pay_method)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
