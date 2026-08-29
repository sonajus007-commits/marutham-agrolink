'use client';

/* The mobile bottom navigation from the reference model — shown only below lg,
 * where a top nav bar would crowd. It is the public shop's tab bar: Home, Shop
 * and Categories stay inside the public site; Cart and Account cross into the
 * portal at /app (same origin, so the session and `ma_cart_v2` carry over — see
 * lib/portal.ts). Account opens the sign-in overlay in place when the provider
 * is present, matching the header's Sign in button.
 *
 * Client-side only for three reasons it genuinely needs the browser for: the
 * active-tab highlight (usePathname), the live cart badge (localStorage), and
 * the login overlay. */

import { usePathname } from 'next/navigation';
import { Home, ShoppingBag, LayoutGrid, ShoppingCart, User } from 'lucide-react';
import { useLoginModal } from '@/components/auth/LoginModalProvider';
import { useCart } from '@/components/cart/CartProvider';
import type { Dict } from '@/lib/dict';

/* Only the plain nav strings — never the whole Dict. This is a Client Component,
 * and the Dict carries function-valued keys (categories.count, product metaDesc)
 * that cannot cross the server→client boundary. */
export function MobileNav({ nav }: { nav: Dict['nav'] }) {
  const pathname = usePathname();
  const modal = useLoginModal();
  const { count, ready } = useCart();

  const isHome = pathname === '/';
  const isShop = pathname.startsWith('/products');
  const base =
    'flex flex-1 flex-col items-center gap-1 py-2 text-[0.65rem] font-medium no-underline transition-colors';
  const active = 'text-blossom-ink';
  const idle = 'text-fg-muted';

  return (
    <nav
      aria-label="Primary mobile"
      className="border-border bg-surface/95 fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    >
      <a
        href="/"
        aria-current={isHome ? 'page' : undefined}
        className={`${base} ${isHome ? active : idle}`}
      >
        <Home className="h-5 w-5" aria-hidden="true" />
        {nav.home}
      </a>
      <a
        href="/products"
        aria-current={isShop ? 'page' : undefined}
        className={`${base} ${isShop ? active : idle}`}
      >
        <ShoppingBag className="h-5 w-5" aria-hidden="true" />
        {nav.shop}
      </a>
      <a href="/#categories" className={`${base} ${idle}`}>
        <LayoutGrid className="h-5 w-5" aria-hidden="true" />
        {nav.categories}
      </a>
      <a href="/cart" className={`${base} ${idle} relative`}>
        <span className="relative">
          <ShoppingCart className="h-5 w-5" aria-hidden="true" />
          {ready && count > 0 ? (
            <span className="bg-blossom-500 absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[0.6rem] font-bold text-white tabular-nums">
              {count > 99 ? '99+' : count}
            </span>
          ) : null}
        </span>
        {nav.cart}
      </a>
      {modal ? (
        <button type="button" onClick={modal.openLogin} className={`${base} ${idle}`}>
          <User className="h-5 w-5" aria-hidden="true" />
          {nav.account}
        </button>
      ) : (
        <a href="/app/login" className={`${base} ${idle}`}>
          <User className="h-5 w-5" aria-hidden="true" />
          {nav.account}
        </a>
      )}
    </nav>
  );
}
