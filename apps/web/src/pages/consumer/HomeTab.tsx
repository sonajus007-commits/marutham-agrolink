import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type SpendByCategory } from '@marutham/api-client';
import {
  Button,
  EmptyState,
  Modal,
  OrderProgress,
  Skeleton,
  Spinner,
  StatTile,
} from '@marutham/ui';
import {
  buildPipeline,
  fmtDateShort,
  fmtMoney,
  isOrderCancelled,
  payMethodKey,
  statusColor,
  statusKey,
  bestOffer,
  offerConsumerPrice,
  getProductEmoji,
  type Order,
  type Product,
} from '@marutham/lib';
import { useOrders } from './OrdersContext';
import { useConsumerData } from './ConsumerDataContext';
import { useCart } from './CartContext';
import { OrderRow, orderLabel } from './OrderRow';
import { QuickActions, type QuickAction } from './QuickActions';
import { FreshArrivals } from './FreshArrivals';
import { ComingSoon } from './ComingSoon';
import { BuyAgainModal } from './BuyAgainModal';
import { TrackPickerModal } from './TrackPickerModal';
import { FadeIn } from '../../components/FadeIn';

// Lazy so the ~1 MB ECharts bundle stays off the dashboard's first paint — it
// only loads once a buyer with order history scrolls the insights into being.
const ShoppingInsights = lazy(() => import('./ShoppingInsights'));

/** Which KPI tile's detail popup is open, if any. */
type TileView = 'active' | 'completed' | 'month' | 'spent' | 'saved';

export function HomeTab({
  onOpenOrder,
  onGoToShop,
  onGoToOrders,
  onGoToCart,
}: {
  onOpenOrder: (id: string) => void;
  onGoToShop: () => void;
  onGoToOrders: () => void;
  onGoToCart: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { orders, groups, loading, error } = useOrders();
  const { products, offersByProduct } = useConsumerData();
  const cart = useCart();

  // Which tile's detail popup is open, or null when the dashboard is at rest.
  // Every KPI tile opens a <Modal> with its slice — the page itself never swaps
  // content, so the buyer can close and open another tile without losing place.
  const [view, setView] = useState<TileView | null>(null);

  // Which Quick-Action popup is open (Buy Again / Track picker), or null.
  const [qa, setQa] = useState<'again' | 'track' | null>(null);

  // Total-Spent popup: this month's spend by product category. Fetched lazily the
  // first time that tile is opened (the orders list carries no line items), then
  // cached for the session. `null` = not loaded yet, [] = loaded and empty.
  const [spendCats, setSpendCats] = useState<SpendByCategory[] | null>(null);
  const [spendLoading, setSpendLoading] = useState(false);
  useEffect(() => {
    if (view !== 'spent' || spendCats !== null || spendLoading) return;
    setSpendLoading(true);
    api
      .getSpendByCategory()
      .then((r) => setSpendCats(r.categories))
      .catch(() => setSpendCats([]))
      .finally(() => setSpendLoading(false));
  }, [view, spendCats, spendLoading]);

  // Recommended = products currently buyable (they have a live offer), with their best
  // consumer price via the same helpers the Shop uses (so the fee maths matches exactly).
  const recommended = products
    .map((p) => {
      const best = bestOffer(offersByProduct[p.id] || []);
      return best ? { product: p, price: offerConsumerPrice(best) } : null;
    })
    .filter((x): x is { product: Product; price: number } => x !== null)
    .slice(0, 8);

  // KPI row (mockup's dashboard header). All real, from order data — Wallet & Reward
  // Points are a Phase-2 feature and are intentionally not shown as fake numbers;
  // they live in <ComingSoon /> below as dashed placeholders instead.
  const now = new Date();
  const thisMonthOrders = orders.filter((o) => {
    const d = o.created_at ? new Date(o.created_at) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const thisMonth = thisMonthOrders.length;
  const totalSpent = groups.delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);
  // Real money the buyer kept vs. the pre-discount price — the `saved` column the
  // order detail and cart already show, summed. Never fabricated.
  const totalSaved = orders.reduce((s, o) => s + (Number(o.saved) || 0), 0);
  // Saved popup: THIS month's orders (excluding cancelled), each shown with its
  // own saving — the "details from each order for the month" breakdown. The tile
  // above stays an all-time running total; only the popup is month-scoped.
  const savedThisMonth = thisMonthOrders.filter((o) => !isOrderCancelled(o));

  // Quick actions all route to real, existing surfaces, and each is disabled
  // when it has nothing to act on:
  //  • Continue Shopping → the cart, only when the cart holds items.
  //  • Buy Again → a popup of the buyer's repeatedly-ordered items that are
  //    buyable today; needs at least some order history to have candidates.
  //  • Track Order → a popup to pick which live order to track.
  //  • Browse Categories → the shop (always available).
  const hasCart = cart.count > 0;
  const quickActions: QuickAction[] = [
    {
      id: 'shop',
      icon: '🛒',
      title: t('consumer.home.qa.shop'),
      subtitle: hasCart
        ? t('consumer.home.qa.shopCount', '{{count}} items in your cart', { count: cart.count })
        : t('consumer.home.qa.shopSub'),
      onClick: onGoToCart,
      disabled: !hasCart,
    },
    {
      id: 'again',
      icon: '🔁',
      title: t('consumer.home.qa.buyAgain'),
      subtitle: t('consumer.home.qa.buyAgainSub'),
      onClick: () => setQa('again'),
      disabled: groups.past.length === 0,
    },
    {
      id: 'track',
      icon: '🛵',
      title: t('consumer.home.qa.track'),
      subtitle: t('consumer.home.qa.trackSub'),
      onClick: () => setQa('track'),
      disabled: groups.active.length === 0,
    },
    {
      id: 'browse',
      icon: '🥬',
      title: t('consumer.home.qa.browse'),
      subtitle: t('consumer.home.qa.browseSub'),
      onClick: onGoToShop,
    },
  ];

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <FadeIn>
        {/* Every tile is a button now — clicking one opens its detail popup.
            The page behind it never changes, so closing the popup returns the
            buyer to exactly this view, ready to open another tile. */}
        <div className="cons-kpis">
          <StatTile
            icon="🚚"
            label={t('consumer.home.activeOrders')}
            value={groups.active.length}
            hint={t('consumer.home.inProgress')}
            onClick={() => setView('active')}
            selected={view === 'active'}
          />
          <StatTile
            icon="✅"
            label={t('consumer.home.completed')}
            value={groups.delivered.length}
            hint={t('consumer.home.delivered')}
            onClick={() => setView('completed')}
            selected={view === 'completed'}
          />
          <StatTile
            icon="📅"
            label={t('consumer.home.thisMonth', 'Orders this month')}
            value={thisMonth}
            // The month name follows the UI language: interpolating an English
            // "July" into the Tamil sentence left it half-translated.
            hint={t('consumer.home.thisMonthHint', 'Placed in {{month}}', {
              month: now.toLocaleString(i18n.language, { month: 'long' }),
            })}
            accent="var(--accent)"
            onClick={() => setView('month')}
            selected={view === 'month'}
          />
          <StatTile
            icon="💰"
            label={t('consumer.home.totalSpent', 'Total spent')}
            value={fmtMoney(totalSpent)}
            hint={t('consumer.home.totalSpentHint', 'On delivered orders')}
            accent="var(--info)"
            onClick={() => setView('spent')}
            selected={view === 'spent'}
          />
          <StatTile
            icon="🎉"
            label={t('consumer.home.totalSaved', 'Total saved')}
            value={fmtMoney(totalSaved)}
            hint={t('consumer.home.totalSavedHint', 'Across your orders')}
            accent="var(--forest)"
            onClick={() => setView('saved')}
            selected={view === 'saved'}
          />
        </div>
      </FadeIn>

      {orders.length === 0 ? (
        <FadeIn delay={0.04}>
          <EmptyState icon="🌿">
            <p>{t('consumer.home.noOrders')}</p>
            <Button style={{ marginTop: 16 }} onClick={onGoToShop}>
              {t('consumer.home.shopNow')} →
            </Button>
          </EmptyState>
        </FadeIn>
      ) : null}

      {/* The dashboard body is always fully visible — the KPI tiles open their
          detail in a popup, so nothing here has to move or hide to make room. */}
      <FadeIn delay={0.08}>
        <QuickActions actions={quickActions} />
      </FadeIn>

      <FadeIn delay={0.12}>
        <FreshArrivals onGoToShop={onGoToShop} />
      </FadeIn>

      {recommended.length > 0 ? (
        <FadeIn delay={0.16}>
          <section className="cons-reco">
            <div className="cons-reco__head">
              <h2 className="cons-section-title">
                {t('consumer.home.recommended', 'Recommended for You')}
              </h2>
              <button type="button" className="cons-reco__all" onClick={onGoToShop}>
                {t('consumer.home.browseAll', 'Browse all')} <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="cons-reco__strip">
              {recommended.map(({ product, price }) => (
                <button
                  key={product.id}
                  type="button"
                  className="cons-reco__card"
                  onClick={onGoToShop}
                  aria-label={`${product.name} — ${t('consumer.home.from', 'from')} ${fmtMoney(price)}`}
                >
                  <span className="cons-reco__emoji" aria-hidden="true">
                    {getProductEmoji(product.name)}
                  </span>
                  <span className="cons-reco__name">{product.name}</span>
                  <span className="cons-reco__price">
                    {t('consumer.home.from', 'from')} {fmtMoney(price)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </FadeIn>
      ) : null}

      {orders.length > 0 ? (
        <FadeIn delay={0.24}>
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-base" />}>
            <ShoppingInsights />
          </Suspense>
        </FadeIn>
      ) : null}

      <FadeIn delay={0.28}>
        <ComingSoon />
      </FadeIn>

      <TileModal
        view={view}
        onClose={() => setView(null)}
        active={groups.active}
        delivered={groups.delivered}
        month={thisMonthOrders}
        savedThisMonth={savedThisMonth}
        spendCats={spendCats}
        spendLoading={spendLoading}
        onOpenOrder={(id) => {
          setView(null);
          onOpenOrder(id);
        }}
        onGoToOrders={() => {
          setView(null);
          onGoToOrders();
        }}
      />

      <BuyAgainModal open={qa === 'again'} onClose={() => setQa(null)} onGoToCart={onGoToCart} />

      <TrackPickerModal
        open={qa === 'track'}
        onClose={() => setQa(null)}
        active={groups.active}
        onPick={(id) => {
          setQa(null);
          onOpenOrder(id);
        }}
      />
    </>
  );
}

/** A green savings row: order code + date on the left, the amount kept on the right. */
function SavedRow({ order: o, onOpen }: { order: Order; onOpen: (id: string) => void }) {
  const { i18n } = useTranslation();
  const saved = Number(o.saved) || 0;
  return (
    <button type="button" className="ord-item" onClick={() => onOpen(o.id)}>
      <span className="ord-item__bar" style={{ background: 'var(--forest)' }} aria-hidden="true" />
      <span className="ord-item__main">
        <span className="ord-id">{orderLabel(o)}</span>
        <span className="ord-loc">{fmtDateShort(o.created_at, i18n.language)}</span>
      </span>
      <span className="ord-item__right">
        <span className="ord-amt" style={{ color: saved > 0 ? 'var(--forest)' : 'inherit' }}>
          {saved > 0 ? `−${fmtMoney(o.saved)}` : fmtMoney(0)}
        </span>
      </span>
    </button>
  );
}

/** One ranked category bar for the Total-Spent breakdown. Single hue by design. */
function CategoryBar({ category, amount, max }: { category: string; amount: number; max: number }) {
  const pct = max > 0 ? Math.max(2, Math.round((amount / max) * 100)) : 0;
  return (
    <div style={{ padding: '8px 0' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          fontSize: 14,
          marginBottom: 5,
        }}
      >
        <span style={{ fontWeight: 600 }}>{category}</span>
        <span>{fmtMoney(amount)}</span>
      </div>
      <div
        style={{ height: 8, borderRadius: 4, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}
        role="presentation"
      >
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--forest)' }} />
      </div>
    </div>
  );
}

/**
 * The tile detail popup. Every KPI tile opens this <Modal> with its own slice:
 *
 *  - active     → in-flight tracking cards
 *  - completed  → delivered orders (compact rows)
 *  - month      → orders placed this calendar month
 *  - spent      → THIS MONTH's item spend, ranked by product category
 *  - saved      → THIS MONTH's orders, each showing the money it kept
 *
 * The tiles behind the popup stay all-time running totals; only Spent & Saved's
 * popups narrow to the current month (that was the buyer's ask). The list is the
 * phone-style card/row layout throughout — the dialog is a narrow (≤420px)
 * column, so the five-column desktop table has no room here. Opening an order
 * closes the popup first (the parent switches surface); the footer's "View all
 * orders" jumps to the Orders tab. Closing (✕ / Escape / backdrop) just returns
 * to the untouched dashboard, ready for the next tile.
 */
function TileModal({
  view,
  onClose,
  active,
  delivered,
  month,
  savedThisMonth,
  spendCats,
  spendLoading,
  onOpenOrder,
  onGoToOrders,
}: {
  view: TileView | null;
  onClose: () => void;
  active: Order[];
  delivered: Order[];
  month: Order[];
  savedThisMonth: Order[];
  spendCats: SpendByCategory[] | null;
  spendLoading: boolean;
  onOpenOrder: (id: string) => void;
  onGoToOrders: () => void;
}) {
  const { t, i18n } = useTranslation();
  const monthLabel = new Date().toLocaleString(i18n.language, { month: 'long', year: 'numeric' });
  const monthSub = t('consumer.home.monthScopeSub', 'This month · {{month}}', {
    month: monthLabel,
  });

  // Per-view title, supporting line, and body. Computed even when closed is cheap
  // and keeps the Modal mounted so its open/close transition can play.
  let title = '';
  let subtitle: string | undefined;
  let body: ReactNode = null;
  // Order-list views get a "View all orders" shortcut in the footer; the category
  // breakdown does not (it isn't a list of orders to open).
  let showViewAll = false;

  const emptyList = (icon: string, text: string) => <EmptyState icon={icon}>{text}</EmptyState>;
  const rowList = (rows: Order[], icon: string, empty: string) =>
    rows.length === 0 ? (
      emptyList(icon, empty)
    ) : (
      <div className="cons-recent__list">
        {rows.map((o) => (
          <OrderRow key={o.id} order={o} onOpen={onOpenOrder} />
        ))}
      </div>
    );

  switch (view) {
    case 'active':
      title = t('consumer.home.activeOrders');
      showViewAll = true;
      body =
        active.length === 0
          ? emptyList('🌿', t('consumer.home.noActive', 'No active orders right now.'))
          : active.map((o) => (
              <TrackingCard
                key={o.id}
                order={o}
                onOpen={onOpenOrder}
                trackLabel={t('consumer.home.track')}
              />
            ));
      break;
    case 'completed':
      title = t('consumer.home.completed');
      showViewAll = true;
      body = rowList(delivered, '📭', t('consumer.home.noCompleted', 'No completed orders yet.'));
      break;
    case 'month':
      title = t('consumer.home.thisMonth', 'Orders this month');
      showViewAll = true;
      body = rowList(month, '📭', t('consumer.home.noMonth', 'No orders placed this month.'));
      break;
    case 'spent': {
      title = t('consumer.home.totalSpent', 'Total spent');
      subtitle = monthSub;
      const cats = spendCats ?? [];
      const max = cats.reduce((m, c) => Math.max(m, Number(c.amount) || 0), 0);
      body = spendLoading ? (
        <Spinner />
      ) : cats.length === 0 ? (
        emptyList('🧺', t('consumer.home.noSpend', 'No spending this month yet.'))
      ) : (
        <div>
          {cats.map((c) => (
            <CategoryBar
              key={c.category}
              category={c.category}
              amount={Number(c.amount) || 0}
              max={max}
            />
          ))}
        </div>
      );
      break;
    }
    case 'saved':
      title = t('consumer.home.totalSaved', 'Total saved');
      subtitle = monthSub;
      showViewAll = true;
      body =
        savedThisMonth.length === 0
          ? emptyList('🌱', t('consumer.home.noSaved', 'No savings recorded yet.'))
          : savedThisMonth.map((o) => <SavedRow key={o.id} order={o} onOpen={onOpenOrder} />);
      break;
    default:
      break;
  }

  return (
    <Modal
      open={view !== null}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
      footer={
        showViewAll ? (
          <Button variant="ghost" onClick={onGoToOrders}>
            {t('consumer.home.viewAllOrders', 'View all orders')} →
          </Button>
        ) : undefined
      }
    >
      {body}
    </Modal>
  );
}

/**
 * Prominent card for an in-flight order: amount, agent, and a progress bar.
 *
 * The whole card is tappable, but the interactive element is the "Track Order"
 * button, whose hit area is stretched over the card. Wrapping the card itself
 * in a <button> would nest block content — and, previously, a scrollable
 * pipeline — inside a control, which touch and screen readers both handle badly.
 */
function TrackingCard({
  order: o,
  onOpen,
  trackLabel,
}: {
  order: Order;
  onOpen: (id: string) => void;
  trackLabel: string;
}) {
  const { t, i18n } = useTranslation();
  return (
    <article className="track-card" style={{ borderLeftColor: statusColor(o.status) }}>
      <div className="track-card__top">
        <div>
          <span className="ord-id">{orderLabel(o)}</span>
          <span className="ord-loc">
            {fmtDateShort(o.created_at, i18n.language)}
            {o.agent_name ? ` · 🛵 ${o.agent_name}` : ''}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="ord-amt">{fmtMoney(o.total)}</span>
          {o.pay_method ? (
            <span className="ord-item__pay">{t(payMethodKey(o.pay_method), o.pay_method)}</span>
          ) : null}
        </div>
      </div>

      {/* Labels are translated HERE, not baked into the nodes: OrderProgress and
          OrderPipeline both key logic off the raw English label. */}
      <OrderProgress
        nodes={buildPipeline(o.route || 'direct', o.status)}
        labelFor={(l) => t(statusKey(l), l)}
        stepText={(step, total) =>
          step > 0
            ? t('consumer.home.stepOf', 'Step {{step}} of {{total}}', { step, total })
            : t('consumer.home.steps', '{{total}} steps', { total })
        }
      />

      <button
        type="button"
        className="track-card__cta"
        aria-label={`${trackLabel} ${orderLabel(o)}`}
        onClick={() => onOpen(o.id)}
      >
        {trackLabel} <span aria-hidden="true">→</span>
        <span className="track-card__hit" />
      </button>
    </article>
  );
}
