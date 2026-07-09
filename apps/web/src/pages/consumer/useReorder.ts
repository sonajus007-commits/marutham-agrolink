import { useCallback } from 'react';
import { bestOffer, offerConsumerPrice, type CartItem, type OrderItem } from '@marutham/lib';
import { useCart } from './CartContext';
import { useConsumerData } from './ConsumerDataContext';

export interface ReorderResult {
  added: number;
  /** Products no longer sold or listed in this district today. */
  unavailable: string[];
}

/**
 * Re-add a past order's items to the cart at *today's* prices.
 *
 * Prices and sellers are never carried over from the old order: yesterday's
 * farmer may not be listing today. Each product is re-matched to its current
 * cheapest offer, which also restores the `farmer_id` that the bill engine
 * needs for the multi-farmer market fee. (The legacy page omitted `farmer_id`
 * on reorder, so those orders lost seller attribution and mis-priced the fee.)
 * Products with no live offer are reported back rather than silently dropped.
 */
export function useReorder(): (items: OrderItem[]) => ReorderResult {
  const { addItem } = useCart();
  const { productById, offersByProduct } = useConsumerData();

  return useCallback(
    (items: OrderItem[]): ReorderResult => {
      const unavailable: string[] = [];
      const lines: CartItem[] = [];

      for (const item of items) {
        const product = item.product_id ? productById[item.product_id] : undefined;
        const offer = product ? bestOffer(offersByProduct[product.id] || []) : null;
        if (!product || !offer) {
          unavailable.push(item.name);
          continue;
        }

        // Don't re-add more than the seller has on hand today.
        const available = offer.qty_available ?? Infinity;
        const qty = Math.min(item.qty, available);
        if (qty <= 0) {
          unavailable.push(item.name);
          continue;
        }

        const farmer = offer.farmer || {};
        lines.push({
          product_id: product.id,
          product_name: product.name,
          unit: product.unit,
          price: offerConsumerPrice(offer, product),
          qty,
          farmer_id: farmer.id || null,
          farmer_name: (farmer.fname || '') + (farmer.lname ? ' ' + farmer.lname : ''),
          listing_id: offer.id || null,
          farmer_price_rs: parseFloat(String(offer.farmer_price)),
        });
      }

      lines.forEach(addItem);
      return { added: lines.length, unavailable };
    },
    [addItem, productById, offersByProduct],
  );
}
