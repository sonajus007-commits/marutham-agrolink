'use client';

import { useCart } from '@/components/cart/CartProvider';

/* Add a product to the public cart, or step its quantity if it's already there.
 * The line carries no farmer_id — the shopper is expressing intent; the portal's
 * checkout resolves an available farmer per line. Price is the public reference
 * price passed in by the (server-rendered) caller. */
export function AddToCartButton({
  productId,
  name,
  unit,
  price,
  label,
  full = false,
}: {
  productId: string;
  name: string;
  unit?: string;
  price: number;
  label: string;
  /** Full-width (product detail) vs compact (card). */
  full?: boolean;
}) {
  const { items, add, setQtyAt } = useCart();
  const index = items.findIndex((i) => i.product_id === productId && !i.farmer_id);
  const qty = index === -1 ? 0 : items[index].qty;

  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={() =>
          add({ product_id: productId, product_name: name, unit, price, qty: 1, farmer_id: null })
        }
        className={`bg-blossom-500/12 text-blossom-ink hover:bg-blossom-500 inline-flex items-center justify-center gap-1.5 rounded-full font-bold no-underline transition-colors hover:text-white ${
          full ? 'w-full px-6 py-3 text-body' : 'px-3 py-1.5 text-caption'
        }`}
      >
        + {label}
      </button>
    );
  }

  const step = (delta: number) => setQtyAt(index, qty + delta);
  return (
    <div
      className={`border-blossom-500/40 inline-flex items-center justify-between gap-1 rounded-full border ${
        full ? 'w-full px-2 py-1.5' : 'px-1.5 py-1'
      }`}
    >
      <button
        type="button"
        onClick={() => step(-1)}
        aria-label="Decrease quantity"
        className="text-blossom-ink hover:bg-blossom-500/12 grid h-7 w-7 place-items-center rounded-full text-lg leading-none"
      >
        −
      </button>
      <span className="text-forest-900 min-w-6 text-center text-caption font-bold tabular-nums">
        {qty}
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        aria-label="Increase quantity"
        className="text-blossom-ink hover:bg-blossom-500/12 grid h-7 w-7 place-items-center rounded-full text-lg leading-none"
      >
        +
      </button>
    </div>
  );
}
