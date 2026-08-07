import { useTranslation } from 'react-i18next';
import { EmptyState } from '@marutham/ui';
import type { Order } from '@marutham/lib';
import { DeliveredList } from './DeliveredList';

/* Delivered (Delivery Agent) / Completed (VCO) page — the day's finished orders.
 * DeliveredList renders nothing when the list is empty, so the page supplies its
 * own empty state. */
export function AgentDelivered({
  orders,
  onOpenView,
}: {
  orders: Order[];
  onOpenView: (id: string) => void;
}) {
  const { t } = useTranslation();
  if (!orders.length) {
    return (
      <EmptyState icon="✅">{t('agent.noCompleted', 'Nothing completed yet today.')}</EmptyState>
    );
  }
  return <DeliveredList orders={orders} onOpenView={onOpenView} />;
}
