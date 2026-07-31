import { useTranslation } from 'react-i18next';
import { EmptyState, Modal } from '@marutham/ui';
import type { Order } from '@marutham/lib';
import { OrderRow } from './OrderRow';

/**
 * "Track Order" picker. Lists the buyer's in-flight orders so they can choose
 * which order number to track; picking one opens that order's detail sheet (the
 * live pipeline + agent + ETA). Shown even for a single active order — the ask
 * was to always let the buyer pick the order, not be dropped into a guess.
 */
export function TrackPickerModal({
  open,
  onClose,
  active,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  active: Order[];
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      title={t('consumer.home.trackPick.title', 'Track an order')}
      subtitle={t('consumer.home.trackPick.sub', 'Choose which order to track')}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
    >
      {active.length === 0 ? (
        <EmptyState icon="🛵">
          {t('consumer.home.trackPick.empty', 'No active orders to track right now.')}
        </EmptyState>
      ) : (
        <div className="cons-recent__list">
          {active.map((o) => (
            <OrderRow key={o.id} order={o} onOpen={onPick} />
          ))}
        </div>
      )}
    </Modal>
  );
}
