import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@marutham/ui';
import { groupConsumerOrders, type Order } from '@marutham/lib';
import { FarmerOrderRow } from './FarmerOrderRow';
import { FarmerOrderSheet } from './FarmerOrderSheet';

/**
 * The seller's Orders tab — every order that contains their produce, split into
 * in-flight and past. The order list itself is owned by FarmerPage (so the tab
 * badge can count orders awaiting packing even while another tab is showing);
 * this component only renders it and opens the detail sheet.
 */
export function FarmerOrdersTab({
  orders,
  loading,
  error,
  reload,
}: {
  orders: Order[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState<Order | null>(null);

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
        onChanged={reload}
      />
    </>
  );
}
