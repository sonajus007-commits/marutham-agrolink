import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Modal, Skeleton, Spinner, StatTile } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  farmerEarnings,
  getProductEmoji,
  groupConsumerOrders,
  isOrderCancelled,
  listingPriceRs,
  listingState,
  fmtMoney,
  type FarmerListing,
  type Order,
  type Payout,
} from '@marutham/lib';
import { FadeIn } from '../../components/FadeIn';
import { FarmerOrderRow } from './FarmerOrderRow';
import { FarmerOrderSheet } from './FarmerOrderSheet';
import { TodaysSupplyCard } from './TodaysSupplyCard';

const FarmerInsights = lazy(() => import('./FarmerInsights'));

/** Which KPI tile's detail popup is open, if any. */
type TileView = 'pack' | 'active' | 'delivered' | 'awaiting' | 'listings';

/** A farmer tab id the quick actions can jump to. */
export type FarmerNavTarget = 'earnings' | 'products' | 'orders' | 'profile';

/**
 * The seller's Home dashboard — the farmer-side twin of the consumer HomeTab.
 * Clickable KPI tiles open a detail popup (orders to pack / in progress /
 * delivered / awaiting payout / live listings), a Quick Actions row routes to the
 * real tabs, a "Your Listings" strip surfaces what's on sale, and a lazy Insights
 * band charts earnings, orders, status and payouts. The orders list is owned by
 * FarmerPage (shared with the Orders tab + the tab badge); payouts and listings
 * are fetched here.
 */
export function FarmerHomeTab({
  orders,
  ordersLoading,
  ordersError,
  reload,
  onGoTo,
}: {
  orders: Order[];
  ordersLoading: boolean;
  ordersError: string | null;
  reload: () => void;
  onGoTo: (target: FarmerNavTarget) => void;
}) {
  const { t } = useTranslation();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [listings, setListings] = useState<FarmerListing[]>([]);

  // Which tile's popup is open, or null when the dashboard is at rest.
  const [view, setView] = useState<TileView | null>(null);
  // Which order's detail sheet is open (opened from a popup row).
  const [openOrder, setOpenOrder] = useState<Order | null>(null);

  const loadSide = useCallback(async () => {
    // Payouts + listings are secondary to the orders the parent already loads —
    // a failure here must not blank the dashboard, so each is swallowed to empty.
    const [p, l] = await Promise.all([
      api.getPayouts().catch(() => ({ payouts: [] as Payout[] })),
      api.getMyListings().catch(() => ({ listings: [] as FarmerListing[] })),
    ]);
    setPayouts(p.payouts || []);
    setListings(l.listings || []);
  }, []);

  useEffect(() => {
    void loadSide();
  }, [loadSide]);

  const groups = useMemo(() => groupConsumerOrders(orders), [orders]);
  const earnings = useMemo(() => farmerEarnings(orders, payouts), [orders, payouts]);

  const packOrders = useMemo(
    () => orders.filter((o) => !isOrderCancelled(o) && String(o.status ?? '') === 'Order Placed'),
    [orders],
  );
  // Delivered orders with no payout record yet — the "awaiting" money bucket.
  const awaitingOrders = useMemo(() => {
    const settled = new Set(payouts.map((p) => p.order?.id).filter(Boolean));
    return groups.delivered.filter((o) => !settled.has(o.id));
  }, [groups.delivered, payouts]);

  // Live = priced and on sale (listed or confirmed for delivery).
  const liveListings = useMemo(
    () => listings.filter((l) => ['listed', 'confirmed'].includes(listingState(l))),
    [listings],
  );

  const openFromPopup = useCallback((o: Order) => {
    setView(null);
    setOpenOrder(o);
  }, []);

  if (ordersLoading && orders.length === 0) return <Spinner />;
  if (ordersError) return <EmptyState icon="⚠️">{ordersError}</EmptyState>;

  return (
    <>
      <FadeIn>
        <div className="fm-kpis">
          <StatTile
            icon="📦"
            label={t('farmer.home.kpi.toPack')}
            value={packOrders.length}
            hint={t('farmer.home.kpi.toPackHint')}
            accent="var(--warning-strong)"
            onClick={() => setView('pack')}
            selected={view === 'pack'}
          />
          <StatTile
            icon="🚚"
            label={t('farmer.home.kpi.inProgress')}
            value={groups.active.length}
            hint={t('farmer.home.kpi.inProgressHint')}
            onClick={() => setView('active')}
            selected={view === 'active'}
          />
          <StatTile
            icon="✅"
            label={t('farmer.home.kpi.delivered')}
            value={groups.delivered.length}
            hint={t('farmer.home.kpi.deliveredHint')}
            accent="var(--forest)"
            onClick={() => setView('delivered')}
            selected={view === 'delivered'}
          />
          <StatTile
            icon="⏳"
            label={t('farmer.home.kpi.awaiting')}
            value={fmtMoney(earnings.awaiting)}
            hint={t('farmer.home.kpi.awaitingHint')}
            accent="var(--info)"
            onClick={() => setView('awaiting')}
            selected={view === 'awaiting'}
          />
          <StatTile
            icon="🌱"
            label={t('farmer.home.kpi.listings')}
            value={liveListings.length}
            hint={t('farmer.home.kpi.listingsHint')}
            onClick={() => setView('listings')}
            selected={view === 'listings'}
          />
        </div>
      </FadeIn>

      {orders.length === 0 ? (
        <FadeIn delay={0.04}>
          <EmptyState icon="🌾">
            <p>{t('farmer.home.noOrders')}</p>
            <Button style={{ marginTop: 16 }} onClick={() => onGoTo('products')}>
              {t('farmer.home.qa.addProduct')} →
            </Button>
          </EmptyState>
        </FadeIn>
      ) : null}

      <FadeIn delay={0.06}>
        <TodaysSupplyCard listings={listings} onReload={loadSide} />
      </FadeIn>

      <FadeIn delay={0.08}>
        <section className="fm-qa" aria-label={t('farmer.home.qa.title')}>
          <h2 className="fm-section-title">{t('farmer.home.qa.title')}</h2>
          <div className="fm-qa__grid">
            <QaCard
              icon="➕"
              title={t('farmer.home.qa.addProduct')}
              subtitle={t('farmer.home.qa.addProductSub')}
              onClick={() => onGoTo('products')}
            />
            <QaCard
              icon="📦"
              title={t('farmer.home.qa.packOrders')}
              subtitle={
                packOrders.length > 0
                  ? t('farmer.home.qa.packOrdersSub', { count: packOrders.length })
                  : t('farmer.home.qa.packOrdersNone')
              }
              onClick={() => onGoTo('orders')}
              disabled={packOrders.length === 0}
            />
            <QaCard
              icon="💰"
              title={t('farmer.home.qa.earnings')}
              subtitle={t('farmer.home.qa.earningsSub')}
              onClick={() => onGoTo('earnings')}
            />
            <QaCard
              icon="👤"
              title={t('farmer.home.qa.profile')}
              subtitle={t('farmer.home.qa.profileSub')}
              onClick={() => onGoTo('profile')}
            />
          </div>
        </section>
      </FadeIn>

      <FadeIn delay={0.12}>
        <section className="fm-reco">
          <div className="fm-reco__head">
            <h2 className="fm-section-title">{t('farmer.home.listings.title')}</h2>
            <button type="button" className="fm-reco__all" onClick={() => onGoTo('products')}>
              {t('farmer.home.listings.all')} <span aria-hidden="true">→</span>
            </button>
          </div>
          {liveListings.length === 0 ? (
            <EmptyState icon="🌱">{t('farmer.home.listings.empty')}</EmptyState>
          ) : (
            <div className="fm-reco__strip">
              {liveListings.map((l) => {
                const name = l.product?.name || '—';
                return (
                  <button
                    key={l.id}
                    type="button"
                    className="fm-reco__card"
                    onClick={() => onGoTo('products')}
                    aria-label={`${name} — ${fmtMoney(listingPriceRs(l))}`}
                  >
                    <span className="fm-reco__emoji" aria-hidden="true">
                      {getProductEmoji(name)}
                    </span>
                    <span className="fm-reco__name">{name}</span>
                    <span className="fm-reco__price">
                      {fmtMoney(listingPriceRs(l))}
                      {l.product?.unit ? ` / ${l.product.unit}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </FadeIn>

      {orders.length > 0 ? (
        <FadeIn delay={0.2}>
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-base" />}>
            <FarmerInsights orders={orders} earnings={earnings} />
          </Suspense>
        </FadeIn>
      ) : null}

      <TileModal
        view={view}
        onClose={() => setView(null)}
        packOrders={packOrders}
        active={groups.active}
        delivered={groups.delivered}
        awaitingOrders={awaitingOrders}
        liveListings={liveListings}
        onOpenOrder={openFromPopup}
        onManageProducts={() => {
          setView(null);
          onGoTo('products');
        }}
      />

      <FarmerOrderSheet
        order={openOrder}
        open={openOrder !== null}
        onClose={() => setOpenOrder(null)}
        onChanged={() => {
          reload();
          void loadSide();
        }}
      />
    </>
  );
}

function QaCard({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="fm-qa__card" onClick={onClick} disabled={disabled}>
      <span className="fm-qa__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="fm-qa__body">
        <span className="fm-qa__title">{title}</span>
        <span className="fm-qa__sub">{subtitle}</span>
      </span>
    </button>
  );
}

/**
 * The tile detail popup. Every KPI tile opens this <Modal> with its own slice —
 * four order lists (pack / active / delivered / awaiting) plus the live-listings
 * roster. Opening an order closes the popup first; the listings view instead
 * offers a jump to the Products tab. Closing returns to the untouched dashboard.
 */
function TileModal({
  view,
  onClose,
  packOrders,
  active,
  delivered,
  awaitingOrders,
  liveListings,
  onOpenOrder,
  onManageProducts,
}: {
  view: TileView | null;
  onClose: () => void;
  packOrders: Order[];
  active: Order[];
  delivered: Order[];
  awaitingOrders: Order[];
  liveListings: FarmerListing[];
  onOpenOrder: (o: Order) => void;
  onManageProducts: () => void;
}) {
  const { t } = useTranslation();

  const rowList = (rows: Order[], icon: string, empty: string) =>
    rows.length === 0 ? (
      <EmptyState icon={icon}>{empty}</EmptyState>
    ) : (
      <div className="fm-recent__list">
        {rows.map((o) => (
          <FarmerOrderRow key={o.id} order={o} onOpen={onOpenOrder} />
        ))}
      </div>
    );

  let title = '';
  let body: ReactNode = null;
  switch (view) {
    case 'pack':
      title = t('farmer.home.pop.pack');
      body = rowList(packOrders, '📦', t('farmer.home.pop.packEmpty'));
      break;
    case 'active':
      title = t('farmer.home.pop.active');
      body = rowList(active, '🚚', t('farmer.home.pop.activeEmpty'));
      break;
    case 'delivered':
      title = t('farmer.home.pop.delivered');
      body = rowList(delivered, '✅', t('farmer.home.pop.deliveredEmpty'));
      break;
    case 'awaiting':
      title = t('farmer.home.pop.awaiting');
      body = rowList(awaitingOrders, '⏳', t('farmer.home.pop.awaitingEmpty'));
      break;
    case 'listings':
      title = t('farmer.home.pop.listings');
      body =
        liveListings.length === 0 ? (
          <EmptyState icon="🌱">{t('farmer.home.listings.empty')}</EmptyState>
        ) : (
          <>
            <div className="fm-recent__list">
              {liveListings.map((l) => {
                const name = l.product?.name || '—';
                return (
                  <div key={l.id} className="fm-listrow">
                    <span className="fm-listrow__emoji" aria-hidden="true">
                      {getProductEmoji(name)}
                    </span>
                    <span className="fm-listrow__name">{name}</span>
                    <span className="fm-listrow__price">
                      {fmtMoney(listingPriceRs(l))}
                      {l.product?.unit ? ` / ${l.product.unit}` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
            <Button style={{ marginTop: 12 }} onClick={onManageProducts}>
              {t('farmer.home.pop.manage')}
            </Button>
          </>
        );
      break;
    default:
      break;
  }

  return (
    <Modal
      open={view !== null}
      title={title}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
    >
      {body}
    </Modal>
  );
}
