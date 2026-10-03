import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner, Tabs } from '@marutham/ui';
import { groupSellerOrders, type Order } from '@marutham/lib';
import { FarmerOrderRow } from './FarmerOrderRow';
import { FarmerOrderSheet } from './FarmerOrderSheet';
import { useSellerOrderNotes } from './sellerOrderNotes';

type TabKey = 'accept' | 'pack' | 'rejected' | 'progress';

/**
 * The seller's Orders tab, split by what the seller has to do:
 *   To accept    — new orders to accept/decline before the window auto-cancels them
 *   Ready to pack — accepted orders to pack for the VCO
 *   Rejected     — cancelled orders (declined, missed window, customer/admin)
 *   On the way   — packed onward, plus delivered
 * The order list itself is owned by FarmerPage (so the tab badge can count orders
 * awaiting the seller even while another tab is showing); this component only
 * renders it and opens the detail sheet, where Accept / Decline / Packed live.
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
  // Null until the seller picks a tab; until then we land on the most urgent one.
  const [picked, setPicked] = useState<TabKey | null>(null);
  const { acceptNote, rejectNote } = useSellerOrderNotes();

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;
  if (orders.length === 0) return <EmptyState icon="📦">{t('farmer.orders.empty')}</EmptyState>;

  const g = groupSellerOrders(orders);
  const tab: TabKey =
    picked ?? (g.toAccept.length ? 'accept' : g.toPack.length ? 'pack' : 'progress');

  const list = (rows: Order[], note?: (o: Order) => ReactNode) =>
    rows.map((o) => <FarmerOrderRow key={o.id} order={o} onOpen={setOpen} note={note?.(o)} />);

  const panel = (hint: string | null, empty: string, body: ReactNode, count: number) => (
    <div className="flex flex-col gap-2 pt-3">
      {hint ? <p className="text-xs text-fg-muted">{hint}</p> : null}
      {count === 0 ? <EmptyState icon="📭">{empty}</EmptyState> : body}
    </div>
  );

  const badge = (n: number) => (n > 0 ? n : undefined);

  return (
    <>
      <Tabs
        className="fm-order-tabs"
        aria-label={t('farmer.orders.split', 'Order groups')}
        value={tab}
        onValueChange={(v) => setPicked(v as TabKey)}
        items={[
          {
            value: 'accept',
            label: t('farmer.orders.tabAccept', 'To accept'),
            badge: badge(g.toAccept.length),
            content: panel(
              t('farmer.orders.hintAccept'),
              t('farmer.orders.emptyAccept', 'No new orders waiting for you.'),
              list(g.toAccept, acceptNote),
              g.toAccept.length,
            ),
          },
          {
            value: 'pack',
            label: t('farmer.orders.tabPack', 'Ready to pack'),
            badge: badge(g.toPack.length),
            content: panel(
              t('farmer.orders.hintPack'),
              t('farmer.orders.emptyPack', 'Nothing to pack right now.'),
              list(g.toPack),
              g.toPack.length,
            ),
          },
          {
            value: 'rejected',
            label: t('farmer.orders.tabRejected', 'Rejected'),
            badge: badge(g.rejected.length),
            content: panel(
              t('farmer.orders.hintRejected'),
              t('farmer.orders.emptyRejected', 'No rejected orders. 👍'),
              list(g.rejected, rejectNote),
              g.rejected.length,
            ),
          },
          {
            value: 'progress',
            label: t('farmer.orders.tabProgress', 'On the way'),
            content: panel(
              null,
              t('farmer.orders.emptyProgress', 'No orders on the way.'),
              <>
                {list(g.inProgress)}
                {g.delivered.length > 0 && (
                  <h3 className="mt-2 text-2xs font-bold uppercase tracking-wider text-fg-muted">
                    {t('farmer.orders.delivered', 'Delivered')} ({g.delivered.length})
                  </h3>
                )}
                {list(g.delivered)}
              </>,
              g.inProgress.length + g.delivered.length,
            ),
          },
        ]}
      />

      <FarmerOrderSheet
        order={open}
        open={open !== null}
        onClose={() => setOpen(null)}
        onChanged={reload}
      />
    </>
  );
}
