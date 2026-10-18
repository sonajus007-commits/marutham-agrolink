import { useEffect, useState } from 'react';
import { api } from '@marutham/api-client';
import type { SellerGeo } from '@marutham/lib';

/** Per-seller distance facts for the cart's delivery address (POST /orders/delivery-quote),
 *  so cartBill prices delivery exactly as POST /orders will. Debounced because the
 *  ad-hoc address changes on every keystroke. null until the first quote lands — and
 *  on failure, when the bill falls back to the flat local rule (the server still
 *  prices the real order). */
export function useDeliveryQuote(
  farmerIds: string[],
  address: Record<string, unknown> | null,
): SellerGeo[] | null {
  const [geo, setGeo] = useState<SellerGeo[] | null>(null);
  // Stable keys — a new array/object with the same content must not refetch.
  const idsKey = [...new Set(farmerIds)].sort().join(',');
  const addrKey = JSON.stringify(address ?? null);

  useEffect(() => {
    if (!idsKey) {
      setGeo(null);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      api
        .getDeliveryQuote(idsKey.split(','), JSON.parse(addrKey))
        .then((res) => {
          if (active) setGeo(res.sellers || []);
        })
        .catch(() => {
          if (active) setGeo(null);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [idsKey, addrKey]);

  return geo;
}
