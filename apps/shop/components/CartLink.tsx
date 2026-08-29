'use client';

/* The header cart control — the public shop's read side of the ratified
 * cart/checkout seam. The cart itself lives in ONE origin-scoped localStorage
 * key, `ma_cart_v2`, written by the portal's CartContext; here we only read it
 * to show a live count and hand off to the portal cart (PORTAL_SHOP). Same
 * origin, so the key is shared — see lib/portal.ts.
 *
 * SSR renders a plain icon (count 0, no badge) so the server and first client
 * paint match; the real count fills in on mount and stays current via the
 * `storage` event (another tab / the portal) and window focus. */

import { useEffect, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { PORTAL_SHOP } from '@/lib/portal';

const CART_KEY = 'ma_cart_v2';

function readCount(): number {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return 0;
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return 0;
    // Sum quantities when present, else count distinct lines.
    return items.reduce((n: number, it: unknown) => {
      const qty =
        typeof it === 'object' && it && 'qty' in it ? Number((it as { qty: unknown }).qty) : 1;
      return n + (Number.isFinite(qty) && qty > 0 ? qty : 1);
    }, 0);
  } catch {
    return 0;
  }
}

export function CartLink({ label }: { label: string }) {
  const [count, setCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(true);
    setCount(readCount());
    const sync = () => setCount(readCount());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  const showBadge = ready && count > 0;

  return (
    <a
      href={PORTAL_SHOP}
      aria-label={showBadge ? `${label} (${count})` : label}
      className="text-forest-800 hover:text-forest-900 hover:bg-mist relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors"
    >
      <ShoppingCart className="h-[1.15rem] w-[1.15rem]" aria-hidden="true" />
      {showBadge ? (
        <span className="bg-blossom-500 absolute -top-0.5 -right-0.5 grid h-[1.1rem] min-w-[1.1rem] place-items-center rounded-full px-1 text-[0.65rem] font-bold text-white tabular-nums">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </a>
  );
}
