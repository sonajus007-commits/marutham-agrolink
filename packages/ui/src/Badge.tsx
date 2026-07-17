import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { isOrderCancelled, statusTone, type Order } from '@marutham/lib';

export type BadgeVariant =
  | 'cod'
  | 'upi'
  | 'neutral'
  /* Tone variants, for a status drawn as a pill. Each is a `<role>Bg` tint under
   * its `<role>Fg` ink — the pair check-contrast.mjs asserts at AA. A pill filled
   * with the status's own `statusColor` would not be readable: those are bar
   * colours, and two of them are pale enough that no ink passes on them. */
  | 'success'
  | 'danger'
  | 'info'
  | 'warning';

const badge = cva('inline-block text-xs font-bold px-[9px] py-[3px] rounded-pill leading-snug', {
  variants: {
    variant: {
      cod: 'bg-warning-bg text-warning-fg',
      upi: 'bg-success-bg text-success',
      neutral: 'bg-success-bg text-primary',
      success: 'bg-success-bg text-success-fg',
      danger: 'bg-danger-bg text-danger-fg',
      info: 'bg-info-bg text-info-fg',
      warning: 'bg-warning-bg text-warning-fg',
    },
  },
  defaultVariants: { variant: 'neutral' },
});

export function Badge({
  variant = 'neutral',
  children,
}: {
  variant?: BadgeVariant;
  children: ReactNode;
}) {
  return <span className={badge({ variant })}>{children}</span>;
}

/** Convenience: pick the badge variant + label from a payment method string. */
export function PaymentBadge({ method }: { method?: string }) {
  const isCod = method === 'Cash on Delivery';
  return <Badge variant={isCod ? 'cod' : 'upi'}>{isCod ? 'COD' : 'UPI'}</Badge>;
}

/**
 * An order's status as a toned pill.
 *
 * Reads `cancelled` rather than trusting `status`: cancelling is a COLUMN, and an
 * order keeps whatever stage it had reached in `status` when it is set — so a
 * cancelled order renders "Out for Delivery", in transit-blue, unless the flag is
 * checked first. Every caller has to remember that, so no caller should have to.
 */
export function StatusBadge({
  order,
  labelFor,
}: {
  order: Order;
  /** Speak the status. Defaults to the English value the API sent. */
  labelFor?: (status: string) => string;
}) {
  const status = isOrderCancelled(order) ? 'Cancelled' : String(order.status ?? '');
  return <Badge variant={statusTone(status)}>{labelFor ? labelFor(status) : status}</Badge>;
}
