import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@marutham/ui';
import { useOrders } from './OrdersContext';
import { OrderRow } from './OrderRow';

export function OrdersTab({ onOpenOrder }: { onOpenOrder: (id: string) => void }) {
  const { t } = useTranslation();
  const { orders, loading, error } = useOrders();

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;
  if (orders.length === 0) return <EmptyState icon="📦">{t('consumer.orders.empty')}</EmptyState>;

  return (
    <div className="ord-list">
      {orders.map((o) => (
        <OrderRow key={o.id} order={o} onOpen={onOpenOrder} />
      ))}
    </div>
  );
}
