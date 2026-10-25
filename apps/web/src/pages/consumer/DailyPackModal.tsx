import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, SegmentedControl, Spinner } from '@marutham/ui';
import {
  composeDailyPack,
  fmtMoney,
  getProductEmoji,
  packCartItems,
  DELIVERY_FLAT,
  FREE_DELIVERY_MIN,
  PACK_MEMBERS,
  type PackLine,
  type PackMembers,
  type PackSlotId,
  type Weekday,
} from '@marutham/lib';
import { useConsumerData } from './ConsumerDataContext';
import { useCart } from './CartContext';
import { useToast } from '../../components/Toast';

const SLOT_LABEL: Record<PackSlotId, string> = {
  tomato: 'Tomato',
  onion: 'Onion',
  smallOnion: 'Small onion',
  chilli: 'Green chilli',
  kuzhambu: 'Kuzhambu / sambar veg',
  poriyal: 'Poriyal veg',
  keerai: 'Keerai',
  coriander: 'Coriander',
  curryLeaves: 'Curry leaves',
  mint: 'Mint',
};

/** "300 g" for a sub-kilo weight, else the qty in the product's own unit. */
function fmtPackQty(line: PackLine): string {
  const unit = line.product.unit || '';
  if (unit === 'kg' && line.qty < 1) return `${Math.round(line.qty * 1000)} g`;
  return `${line.qty} ${unit}`;
}

/**
 * "Daily veg pack" popup. Composes today's cooking vegetables for a 2/3/5-member
 * family from the live offers in the buyer's district (already narrowed to their
 * radius), one slot per cooking role, from at most four farmers. The pack is
 * recomputed on every render from the live feed, so a district or radius change
 * while open keeps it honest. "Add pack" drops each line into the cart with its
 * farmer pinned; from there it is an ordinary cart the buyer can still edit.
 */
export function DailyPackModal({
  open,
  onClose,
  onGoToCart,
}: {
  open: boolean;
  onClose: () => void;
  onGoToCart: () => void;
}) {
  const { t } = useTranslation();
  const { products, offersByProduct, loading } = useConsumerData();
  const { items, addItem, updateQtyAt } = useCart();
  const toast = useToast();
  const [members, setMembers] = useState<PackMembers>(3);
  const weekday = new Date().getDay() as Weekday;

  const pack = useMemo(
    () => composeDailyPack(products, offersByProduct, members, weekday),
    [products, offersByProduct, members, weekday],
  );

  const slotLabel = (id: PackSlotId) => t(`consumer.pack.slot.${id}`, SLOT_LABEL[id]);

  // Adds ON TOP of what is already in the cart — addItem alone would replace the
  // qty of a matching line and quietly shrink an order the buyer had built.
  const addPack = () => {
    for (const item of packCartItems(pack)) {
      const idx = items.findIndex(
        (i) => i.product_id === item.product_id && (i.farmer_id || null) === item.farmer_id,
      );
      if (idx === -1) addItem(item);
      else updateQtyAt(idx, Math.round((items[idx].qty + item.qty) * 1000) / 1000);
    }
    toast(t('consumer.pack.added', 'Daily pack added to cart'), 'ok');
    onClose();
    onGoToCart();
  };

  return (
    <Modal
      open={open}
      title={t('consumer.pack.title', 'Daily veg pack')}
      subtitle={t('consumer.pack.sub', "Today's cooking vegetables, from local farmers")}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
      footer={
        pack.available ? (
          <Button onClick={addPack}>
            {t('consumer.pack.add', 'Add pack · {{total}}', { total: fmtMoney(pack.total) })} →
          </Button>
        ) : undefined
      }
    >
      <SegmentedControl<string>
        aria-label={t('consumer.pack.members', 'Family size')}
        className="mb-3"
        value={String(members)}
        onChange={(v) => setMembers(Number(v) as PackMembers)}
        options={PACK_MEMBERS.map((m) => ({
          value: String(m),
          label: t('consumer.pack.membersN', '{{count}} members', { count: m }),
        }))}
      />

      {loading ? (
        <Spinner />
      ) : !pack.available ? (
        <EmptyState icon="🧺">
          {t(
            'consumer.pack.unavailable',
            "Today's pack isn't available — no local farmer has {{slots}} today.",
            { slots: pack.missing.map(slotLabel).join(', ') },
          )}
        </EmptyState>
      ) : (
        <div>
          {pack.lines.map((line) => (
            <div
              key={line.slot}
              className="flex items-center gap-3 border-b border-surface-muted py-2.5 last:border-0"
            >
              <span className="text-2xl" aria-hidden="true">
                {getProductEmoji(line.product.name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-primary">
                  {line.product.name} · {fmtPackQty(line)}
                </div>
                <div className="text-xs text-fg-muted">{slotLabel(line.slot)}</div>
              </div>
              <div className="text-sm font-bold text-primary">{fmtMoney(line.lineTotal)}</div>
            </div>
          ))}
          <p className="mt-3 text-xs text-fg-muted">
            {t(
              'consumer.pack.note',
              'Farmers in this pack: {{count}}. Delivery {{fee}}, free over {{min}}. You can change quantities in the cart.',
              {
                count: pack.farmerCount,
                fee: fmtMoney(DELIVERY_FLAT),
                min: fmtMoney(FREE_DELIVERY_MIN),
              },
            )}
          </p>
        </div>
      )}
    </Modal>
  );
}
