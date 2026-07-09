import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '@marutham/api-client';
import { groupConsumerOrders, type ConsumerOrderGroups, type Order } from '@marutham/lib';

/* One GET /orders for the whole consumer shell. The legacy page refetched on
 * every tab switch; Home, Orders and the tab badge now read the same list and
 * refresh() is called after any mutation (cancel, return, place order). */

interface OrdersState {
  orders: Order[];
  groups: ConsumerOrderGroups;
  /** Active order count — drives the Orders tab badge. */
  activeCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const Ctx = createContext<OrdersState | null>(null);

export function OrdersProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrders();
      setOrders(res.orders || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load orders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const groups = useMemo(() => groupConsumerOrders(orders), [orders]);

  const value = useMemo<OrdersState>(
    () => ({ orders, groups, activeCount: groups.active.length, loading, error, refresh }),
    [orders, groups, loading, error, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrders(): OrdersState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useOrders must be used within <OrdersProvider>');
  return ctx;
}
