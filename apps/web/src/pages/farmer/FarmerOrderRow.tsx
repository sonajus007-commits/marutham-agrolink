import { useTranslation } from 'react-i18next';
import { fmtDateShort, fmtMoney, isOrderCancelled, statusColor, type Order } from '@marutham/lib';

/** Short human handle for an order — the code, or a truncated id for old rows. */
export function orderLabel(o: Order): string {
  return o.code || o.id.slice(0, 8).toUpperCase();
}

/**
 * A seller-facing order row. Unlike the consumer row it leads with what the
 * seller is owed (`farmer_payout`, computed per order by GET /orders), not the
 * consumer's total, and shows only the delivery village — never the buyer's
 * name, phone or address.
 */
export function FarmerOrderRow({ order, onOpen }: { order: Order; onOpen: (o: Order) => void }) {
  const { t } = useTranslation();
  const label = isOrderCancelled(order) ? 'Cancelled' : order.status;
  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className="flex w-full items-stretch gap-3 rounded-base border border-border-subtle bg-surface p-3 text-left transition-colors hover:bg-surface-muted"
    >
      <span className="w-1 shrink-0 rounded-full" style={{ background: statusColor(label) }} aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="text-sm font-bold text-primary">{orderLabel(order)}</span>
        <span className="text-2xs text-fg-muted">
          {label} · {fmtDateShort(order.created_at)}
          {order.village ? ` · ${order.village}` : ''}
        </span>
      </span>
      <span className="flex flex-col items-end justify-center">
        <span className="text-2xs uppercase tracking-wide text-fg-muted">{t('farmer.orders.youEarn')}</span>
        <span className="text-sm font-bold">{fmtMoney(order.farmer_payout)}</span>
      </span>
    </button>
  );
}
