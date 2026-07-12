'use client';

import { PENDING_ORDER_KEY, PORTAL_LOGIN, PORTAL_SHOP } from '@/lib/portal';

/* The login boundary — the one place the public shop touches the private portal.
 *
 * A visitor taps a product, we remember WHICH product in localStorage, and hand
 * them to the portal. If they already have a session we send them straight to
 * the storefront; otherwise to sign-in, and the portal picks the pending product
 * up on the other side. This is the handoff the legacy homepage did, preserved
 * exactly (same `ma_pending_order` key, same `ma_token` probe).
 *
 * It works ONLY because the shop and the portal are one origin: localStorage is
 * origin-scoped, so serving this page from another host would silently drop the
 * product on the floor at the moment of highest intent. Hence the Express proxy
 * — see backend/server.js. */
export function OrderButton({ productId, label }: { productId: string; label: string }) {
  function go() {
    try {
      localStorage.setItem(PENDING_ORDER_KEY, productId);
    } catch {
      /* private mode / storage disabled — the visitor still gets to sign in. */
    }
    const signedIn = !!localStorage.getItem('ma_token');
    window.location.href = signedIn ? PORTAL_SHOP : PORTAL_LOGIN;
  }

  return (
    <button
      type="button"
      onClick={go}
      className="mt-3 w-full cursor-pointer rounded-full border-0 bg-primary px-4 py-2.5 text-sm font-bold text-primary-on transition-colors hover:bg-primary-hover"
    >
      {label}
    </button>
  );
}
