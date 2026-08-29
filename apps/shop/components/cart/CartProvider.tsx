'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CartItem } from '@marutham/lib';

/* The PUBLIC cart, the read+write side of the ratified cart seam. It stores the
 * exact same origin-scoped localStorage key the portal uses — `ma_cart_v2`, one
 * CartItem[] — so a cart built here on the public shop is the cart the portal
 * shows after sign-in, and the portal's checkout places it (resolving a farmer
 * per line at checkout when the public line has none). One store, two renderers.
 *
 * Public lines carry no farmer_id (the shopper hasn't picked an offer); the
 * portal's Checkout resolves an available farmer for each such line. Price is the
 * public reference price; the portal re-derives the final bill. */

const CART_KEY = 'ma_cart_v2';
const LEGACY_KEYS = ['ma_cart'];

function load(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface CartApi {
  items: CartItem[];
  /** Distinct product lines — matches the badge the portal shows. */
  count: number;
  ready: boolean;
  /** Add one line, or increment the qty of a matching (product, farmer) line. */
  add: (item: CartItem) => void;
  setQtyAt: (index: number, qty: number) => void;
  removeAt: (index: number) => void;
  clear: () => void;
}

const CartContext = createContext<CartApi | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  // Hydrate from storage on mount (SSR renders an empty cart, matching the
  // server), and keep in sync with other tabs / the portal via `storage`.
  useEffect(() => {
    for (const k of LEGACY_KEYS) {
      try {
        localStorage.removeItem(k);
      } catch {
        /* ignore */
      }
    }
    setItems(load());
    setReady(true);
    const sync = () => setItems(load());
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      /* private mode / storage full — the cart just won't persist */
    }
  }, [items, ready]);

  const add = useCallback((item: CartItem) => {
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) =>
          i.product_id === item.product_id && (i.farmer_id || null) === (item.farmer_id || null),
      );
      if (idx === -1) return [...prev, item];
      const next = [...prev];
      next[idx] = { ...next[idx], qty: next[idx].qty + item.qty };
      return next;
    });
  }, []);

  const setQtyAt = useCallback((index: number, qty: number) => {
    setItems((prev) =>
      qty <= 0
        ? prev.filter((_, i) => i !== index)
        : prev.map((it, i) => (i === index ? { ...it, qty } : it)),
    );
  }, []);

  const removeAt = useCallback(
    (index: number) => setItems((prev) => prev.filter((_, i) => i !== index)),
    [],
  );

  const clear = useCallback(() => setItems([]), []);

  return (
    <CartContext.Provider
      value={{ items, count: items.length, ready, add, setQtyAt, removeAt, clear }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
