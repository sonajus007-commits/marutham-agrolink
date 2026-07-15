import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';

export type BadgeVariant = 'cod' | 'upi' | 'neutral';

const badge = cva('inline-block text-xs font-bold px-[9px] py-[3px] rounded-pill leading-snug', {
  variants: {
    variant: {
      cod: 'bg-warning-bg text-warning-fg',
      upi: 'bg-success-bg text-success',
      neutral: 'bg-success-bg text-primary',
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
