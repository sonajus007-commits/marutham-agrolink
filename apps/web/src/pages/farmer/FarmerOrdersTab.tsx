import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { groupConsumerOrders, type Order } from '@marutham/lib';
import { FarmerOrderRow } from './FarmerOrderRow';
import { FarmerOrderSheet } from './FarmerOrderSheet';

/**
 * The seller's Orders tab — every order that contains their produce, split into
 * in-flight and past. GET /orders already scopes to the farmer and attaches the
 * per-order payout, so there is no farmer-specific endpoint to add.
 */
export function FarmerOrdersTab() {
  const { t } = useTranslation();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Order | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getOrders();
      setOrders(res.orders || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('consumer.orders.loadFailed', 'Could not load orders'),
      );
    } finally {
      setLoading(false);
    }
    // `t` is a dependency: without it this closure keeps the language it was
    // created in, and the fallback would still be English after a switch.
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;
  if (orders.length === 0) return <EmptyState icon="📦">{t('farmer.orders.empty')}</EmptyState>;

  const { active, past } = groupConsumerOrders(orders);

  return (
    <>
      {active.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-fg-muted">
            {t('farmer.orders.active')} ({active.length})
          </h3>
          {active.map((o) => (
            <FarmerOrderRow key={o.id} order={o} onOpen={setOpen} />
          ))}
        </section>
      )}

      {past.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-2xs font-bold uppercase tracking-wider text-fg-muted">
            {t('farmer.orders.past')} ({past.length})
          </h3>
          {past.map((o) => (
            <FarmerOrderRow key={o.id} order={o} onOpen={setOpen} />
          ))}
        </section>
      )}

      <FarmerOrderSheet
        order={open}
        open={open !== null}
        onClose={() => setOpen(null)}
        onChanged={load}
      />
    </>
  );
}
