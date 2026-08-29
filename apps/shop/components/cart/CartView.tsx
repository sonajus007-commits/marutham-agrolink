'use client';

import Link from 'next/link';
import { fmtMoney } from '@marutham/lib';
import { useCart } from '@/components/cart/CartProvider';
import { useLoginModal } from '@/components/auth/LoginModalProvider';
import { PORTAL_SHOP, PORTAL_LOGIN } from '@/lib/portal';

export interface CartCopy {
  title: string;
  empty: string;
  emptyCta: string;
  remove: string;
  subtotal: string;
  subtotalNote: string;
  checkout: string;
  keepShopping: string;
  perUnit: string;
}

/* The public cart. Reads the shared ma_cart_v2 via CartProvider; "Proceed to
 * checkout" crosses to the portal (same origin, so the cart carries over) —
 * signed in → straight to the portal shop/cart; otherwise the sign-in overlay,
 * after which the portal picks up the same cart and its checkout resolves a
 * farmer per line. The prices here are the public reference prices; the portal
 * re-derives the final bill (item + delivery + handling on their own lines). */
export function CartView({ copy }: { copy: CartCopy }) {
  const { items, setQtyAt, removeAt, ready } = useCart();
  const modal = useLoginModal();

  function checkout() {
    let signedIn = false;
    try {
      // One-shot intent the portal's ConsumerPage reads on mount → opens the
      // cart tab, so the shopper lands on their cart (not the consumer home),
      // whether we hand off directly or via sign-in.
      localStorage.setItem('ma_intent_tab', 'cart');
      signedIn = !!localStorage.getItem('ma_token');
    } catch {
      /* storage disabled — treat as signed out */
    }
    if (signedIn) window.location.href = PORTAL_SHOP;
    else if (modal) modal.openLogin();
    else window.location.href = PORTAL_LOGIN;
  }

  if (!ready) {
    return <div className="text-fg-muted py-24 text-center">…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="border-border rounded-2xl border border-dashed px-6 py-20 text-center">
        <p className="text-fg-muted text-body">{copy.empty}</p>
        <Link
          href="/products"
          className="bg-blossom-500 mt-5 inline-flex rounded-full px-6 py-3 text-body font-bold text-white no-underline"
        >
          {copy.emptyCta}
        </Link>
      </div>
    );
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_20rem]">
      <ul className="flex list-none flex-col gap-3 p-0">
        {items.map((it, i) => (
          <li
            key={`${it.product_id}-${i}`}
            className="border-border bg-surface flex items-center gap-4 rounded-2xl border p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="text-forest-900 truncate font-bold">{it.product_name}</p>
              <p className="text-fg-muted text-caption">
                {fmtMoney(it.price)}
                {it.unit ? ` ${copy.perUnit} ${it.unit}` : ''}
              </p>
            </div>

            <div className="border-blossom-500/40 inline-flex items-center gap-1 rounded-full border px-1.5 py-1">
              <button
                type="button"
                onClick={() => setQtyAt(i, it.qty - 1)}
                aria-label="Decrease quantity"
                className="text-blossom-ink hover:bg-blossom-500/12 grid h-7 w-7 place-items-center rounded-full text-lg leading-none"
              >
                −
              </button>
              <span className="text-forest-900 min-w-6 text-center text-caption font-bold tabular-nums">
                {it.qty}
              </span>
              <button
                type="button"
                onClick={() => setQtyAt(i, it.qty + 1)}
                aria-label="Increase quantity"
                className="text-blossom-ink hover:bg-blossom-500/12 grid h-7 w-7 place-items-center rounded-full text-lg leading-none"
              >
                +
              </button>
            </div>

            <div className="w-20 shrink-0 text-right">
              <span className="text-forest-900 font-extrabold tabular-nums">
                {fmtMoney(it.price * it.qty)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => removeAt(i)}
              className="text-fg-muted hover:text-blossom-ink shrink-0 text-caption font-semibold"
            >
              {copy.remove}
            </button>
          </li>
        ))}
      </ul>

      <aside className="border-border bg-surface-raised h-fit rounded-2xl border p-6">
        <div className="flex items-center justify-between">
          <span className="text-forest-900 font-bold">{copy.subtotal}</span>
          <span className="text-forest-900 text-xl font-extrabold tabular-nums">
            {fmtMoney(subtotal)}
          </span>
        </div>
        <p className="text-fg-muted mt-1 text-caption">{copy.subtotalNote}</p>
        <button
          type="button"
          onClick={checkout}
          className="bg-blossom-500 mt-5 w-full rounded-full px-6 py-3 text-body font-bold text-white transition-[filter] hover:brightness-105"
        >
          {copy.checkout}
        </button>
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 mt-3 inline-flex w-full justify-center text-caption font-semibold no-underline"
        >
          {copy.keepShopping}
        </Link>
      </aside>
    </div>
  );
}
