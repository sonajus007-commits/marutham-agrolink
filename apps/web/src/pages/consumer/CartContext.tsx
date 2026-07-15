import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { CartItem } from '@marutham/lib';

const CART_KEY = 'ma_cart';

function load(): CartItem[] {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

interface CartState {
  items: CartItem[];
  count: number; // distinct products (matches legacy cart badge)
  /** Upsert by (product_id, farmer_id); replaces qty for an existing line. */
  addItem: (item: CartItem) => void;
  updateQtyAt: (index: number, qty: number) => void;
  removeAt: (index: number) => void;
  clear: () => void;
  qtyOfProduct: (productId: string) => number;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => load());

  // Persist to the same key the legacy site uses (interop during migration).
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      const idx = prev.findIndex(
        (i) =>
          i.product_id === item.product_id && (i.farmer_id || null) === (item.farmer_id || null),
      );
      if (idx === -1) return [...prev, item];
      const next = prev.slice();
      next[idx] = { ...next[idx], qty: item.qty };
      return next;
    });
  }, []);

  const updateQtyAt = useCallback((index: number, qty: number) => {
    setItems((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      if (qty <= 0) return prev.filter((_, i) => i !== index);
      const next = prev.slice();
      next[index] = { ...next[index], qty };
      return next;
    });
  }, []);

  const removeAt = useCallback((index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const qtyOfProduct = useCallback(
    (productId: string) => items.find((i) => i.product_id === productId)?.qty || 0,
    [items],
  );

  const value = useMemo<CartState>(
    () => ({ items, count: items.length, addItem, updateQtyAt, removeAt, clear, qtyOfProduct }),
    [items, addItem, updateQtyAt, removeAt, clear, qtyOfProduct],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
