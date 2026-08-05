import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Modal } from '@marutham/ui';
import type { Order } from '@marutham/lib';
import { OrderRow, orderLabel } from './OrderRow';

/**
 * "Track Order" picker. Lists the buyer's in-flight orders so they can choose
 * which order number to track; picking one opens that order's detail sheet (the
 * live pipeline + agent + ETA). Shown even for a single active order — the ask
 * was to always let the buyer pick the order, not be dropped into a guess.
 *
 * A search box lets the buyer type the order number instead of scrolling the
 * list; it matches against the order code and the id fallback.
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
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active;
    return active.filter((o) => {
      const label = orderLabel(o).toLowerCase();
      const id = String(o.id).toLowerCase();
      return label.includes(q) || id.includes(q);
    });
  }, [active, query]);

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
        <>
          <input
            className="cons-input"
            style={{ marginBottom: 12 }}
            type="search"
            placeholder={`🔍  ${t('consumer.home.trackPick.search', 'Enter order number')}`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('consumer.home.trackPick.search', 'Enter order number')}
          />
          {filtered.length === 0 ? (
            <EmptyState icon="🔍">
              {t('consumer.home.trackPick.noMatch', 'No active order matches that number.')}
            </EmptyState>
          ) : (
            <div className="cons-recent__list">
              {filtered.map((o) => (
                <OrderRow key={o.id} order={o} onOpen={onPick} />
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
