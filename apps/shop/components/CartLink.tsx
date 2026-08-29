'use client';

/* The header cart control. Reads the shared cart via the CartProvider (over
 * ma_cart_v2) and links to the public /cart page, which hands off to the portal
 * checkout. SSR shows no badge (count 0); it fills in on mount. */

import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { useCart } from '@/components/cart/CartProvider';

export function CartLink({ label }: { label: string }) {
  const { count, ready } = useCart();
  const showBadge = ready && count > 0;

  return (
    <Link
      href="/cart"
      aria-label={showBadge ? `${label} (${count})` : label}
      className="text-forest-800 hover:text-forest-900 hover:bg-mist relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors"
    >
      <ShoppingCart className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
      {showBadge ? (
        <span className="bg-blossom-500 absolute -top-0.5 -right-0.5 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full px-1 text-[0.65rem] font-bold text-white tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </Link>
  );
}
