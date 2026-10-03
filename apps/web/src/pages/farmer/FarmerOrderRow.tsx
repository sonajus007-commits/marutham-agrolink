import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusPill } from '@marutham/ui';
import {
  fmtDateShort,
  fmtMoney,
  isOrderCancelled,
  statusColor,
  statusKey,
  statusTone,
  type Order,
} from '@marutham/lib';

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
export function FarmerOrderRow({
  order,
  onOpen,
  note,
}: {
  order: Order;
  onOpen: (o: Order) => void;
  /** One line under the status — the accept countdown, or why it was rejected. */
  note?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  // The English value drives statusColor; only the spoken form is translated.
  const status = isOrderCancelled(order) ? 'Cancelled' : String(order.status ?? '');
  return (
    <button
      type="button"
      onClick={() => onOpen(order)}
      className="flex w-full items-stretch gap-3 rounded-base border border-border-subtle bg-surface p-3 text-left transition-colors hover:bg-surface-muted"
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{ background: statusColor(status) }}
        aria-hidden="true"
      />
      <span className="flex min-w-0 flex-1 flex-col justify-center">
        <span className="text-sm font-bold text-primary">{orderLabel(order)}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <StatusPill tone={statusTone(status)} size="sm" dot>
            {t(statusKey(status), status)}
          </StatusPill>
          <span className="text-2xs text-fg-muted">
            {fmtDateShort(order.created_at, i18n.language)}
            {order.village ? ` · ${order.village}` : ''}
          </span>
        </span>
        {note ? <span className="mt-1 text-xs font-semibold">{note}</span> : null}
      </span>
      <span className="flex flex-col items-end justify-center">
        {/* A cancelled order pays nothing — show what it was worth, struck through. */}
        <span className="text-2xs uppercase tracking-wide text-fg-muted">
          {isOrderCancelled(order) ? t('farmer.orders.notEarned') : t('farmer.orders.youEarn')}
        </span>
        <span
          className={`text-sm font-bold${isOrderCancelled(order) ? ' text-fg-muted line-through' : ''}`}
        >
          {fmtMoney(order.farmer_payout)}
        </span>
      </span>
    </button>
  );
}
