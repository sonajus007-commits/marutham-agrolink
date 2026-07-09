export type BadgeVariant = 'cod' | 'upi' | 'neutral';

export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: React.ReactNode }) {
  return <span className={`ma-badge ma-badge--${variant}`}>{children}</span>;
}

/** Convenience: pick the badge variant + label from a payment method string. */
export function PaymentBadge({ method }: { method?: string }) {
  const isCod = method === 'Cash on Delivery';
  return <Badge variant={isCod ? 'cod' : 'upi'}>{isCod ? 'COD' : 'UPI'}</Badge>;
}
