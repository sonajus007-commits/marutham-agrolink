import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type FrequentItem } from '@marutham/api-client';
import { Button, EmptyState, Modal, Spinner } from '@marutham/ui';
import {
  bestOffer,
  fmtMoney,
  getProductEmoji,
  offerConsumerPrice,
  type Product,
} from '@marutham/lib';
import { useConsumerData } from './ConsumerDataContext';
import { useReorder } from './useReorder';
import { useToast } from '../../components/Toast';

/** A frequent item paired with its current live offer — only these are shown. */
interface BuyAgainRow {
  freq: FrequentItem;
  product: Product;
  price: number;
}

/**
 * "Buy Again" popup. Lists the products this buyer has ordered on 2+ separate
 * orders (the server's tally) that ALSO have a live offer in the current district
 * today, re-priced at today's cheapest rate. Each row adds that product to the
 * cart at today's price/seller via the shared reorder logic; "Add all" adds every
 * listed item and jumps to the cart.
 *
 * Availability and price are recomputed from the live offers feed on every render
 * (not baked in at fetch time), so a district switch while the popup is open keeps
 * the list honest. The server tally is fetched once per open.
 */
export function BuyAgainModal({
  open,
  onClose,
  onGoToCart,
}: {
  open: boolean;
  onClose: () => void;
  onGoToCart: () => void;
}) {
  const { t } = useTranslation();
  const { productById, offersByProduct, loading: dataLoading } = useConsumerData();
  const reorder = useReorder();
  const toast = useToast();

  // The raw server tally (product_id + how many orders + last qty). `null` until
  // the first open loads it; cached for the session after that.
  const [freq, setFreq] = useState<FrequentItem[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || freq !== null || loading) return;
    setLoading(true);
    api
      .getFrequentItems()
      .then((r) => setFreq(r.items || []))
      .catch(() => setFreq([]))
      .finally(() => setLoading(false));
  }, [open, freq, loading]);

  // Keep only the items still sold in this district today, priced at today's rate.
  const rows = useMemo<BuyAgainRow[]>(() => {
    if (!freq) return [];
    const out: BuyAgainRow[] = [];
    for (const f of freq) {
      const product = productById[f.product_id];
      const offer = product ? bestOffer(offersByProduct[product.id] || []) : null;
      if (!product || !offer) continue;
      // Nothing on hand today → not buyable, so it's not a Buy-Again candidate.
      if ((offer.qty_available ?? Infinity) <= 0) continue;
      out.push({ freq: f, product, price: offerConsumerPrice(offer) });
    }
    return out;
  }, [freq, productById, offersByProduct]);

  const addRows = (rs: BuyAgainRow[]) =>
    reorder(
      rs.map((r) => ({ product_id: r.product.id, name: r.product.name, qty: r.freq.last_qty })),
    );

  const addOne = (row: BuyAgainRow) => {
    const { added } = addRows([row]);
    if (added > 0)
      toast(
        t('consumer.home.buyAgain.added', '{{name}} added to cart', { name: row.product.name }),
      );
  };

  const addAll = () => {
    const { added } = addRows(rows);
    if (added > 0) {
      toast(
        t('consumer.home.buyAgain.addedAll', '{{count}} items added to cart', { count: added }),
      );
      onClose();
      onGoToCart();
    }
  };

  const busy = loading || (dataLoading && freq === null);

  return (
    <Modal
      open={open}
      title={t('consumer.home.buyAgain.title', 'Buy Again')}
      subtitle={t('consumer.home.buyAgain.sub', 'Your regulars, in stock today')}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
      footer={
        rows.length > 0 ? (
          <Button onClick={addAll}>
            {t('consumer.home.buyAgain.addAll', 'Add all to cart')} →
          </Button>
        ) : undefined
      }
    >
      {busy ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <EmptyState icon="🧺">
          {t(
            'consumer.home.buyAgain.empty',
            'None of your regular items are available to order today.',
          )}
        </EmptyState>
      ) : (
        <div>
          {rows.map((row) => (
            <div
              key={row.product.id}
              className="flex items-center gap-3 border-b border-surface-muted py-2.5 last:border-0"
            >
              <span className="text-2xl" aria-hidden="true">
                {getProductEmoji(row.product.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-primary">{row.product.name}</div>
                <div className="text-xs text-fg-muted">
                  {t('consumer.home.buyAgain.orderedTimes', 'Ordered {{count}}×', {
                    count: row.freq.order_count,
                  })}{' '}
                  · {fmtMoney(row.price)}
                </div>
              </div>
              <Button variant="ghost" onClick={() => addOne(row)}>
                {t('consumer.home.buyAgain.add', 'Add')}
              </Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
