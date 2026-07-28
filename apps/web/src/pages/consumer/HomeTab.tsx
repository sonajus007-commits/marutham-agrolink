import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  EmptyState,
  OrderProgress,
  Skeleton,
  Spinner,
  StatTile,
  StatusBadge,
} from '@marutham/ui';
import {
  buildPipeline,
  fmtDateShort,
  fmtMoney,
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
import { OrderRow, orderLabel } from './OrderRow';
import { QuickActions, type QuickAction } from './QuickActions';
import { FreshArrivals } from './FreshArrivals';
import { ComingSoon } from './ComingSoon';
import { FadeIn } from '../../components/FadeIn';

// Lazy so the ~1 MB ECharts bundle stays off the dashboard's first paint — it
// only loads once a buyer with order history scrolls the insights into being.
const ShoppingInsights = lazy(() => import('./ShoppingInsights'));

/** Past orders shown on Home before the user has to open the Orders tab. */
const PAST_PREVIEW = 4;

/** Which KPI tile is driving the orders panel. */
type OrderFilter = 'active' | 'completed' | 'month';

export function HomeTab({
  onOpenOrder,
  onGoToShop,
  onGoToOrders,
}: {
  onOpenOrder: (id: string) => void;
  onGoToShop: () => void;
  onGoToOrders: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { orders, groups, loading, error } = useOrders();
  const { products, offersByProduct } = useConsumerData();

  // Which tile is selected. The orders panel below the tiles shows ONLY this
  // slice — clicking a KPI tile is now a filter, not a dead statistic. Active is
  // the default so the dashboard opens on in-flight orders, as it always did.
  const [filter, setFilter] = useState<OrderFilter>('active');

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

  // Quick actions all route to real, existing surfaces. Buy Again opens the most
  // recent past order (where the reorder button lives); Track opens the live order.
  const firstActive = groups.active[0];
  const lastPast = groups.past[0];
  const quickActions: QuickAction[] = [
    {
      id: 'shop',
      icon: '🛒',
      title: t('consumer.home.qa.shop'),
      subtitle: t('consumer.home.qa.shopSub'),
      onClick: onGoToShop,
    },
    {
      id: 'again',
      icon: '🔁',
      title: t('consumer.home.qa.buyAgain'),
      subtitle: t('consumer.home.qa.buyAgainSub'),
      onClick: () => lastPast && onOpenOrder(lastPast.id),
      disabled: !lastPast,
    },
    {
      id: 'track',
      icon: '🛵',
      title: t('consumer.home.qa.track'),
      subtitle: t('consumer.home.qa.trackSub'),
      onClick: () => (firstActive ? onOpenOrder(firstActive.id) : onGoToOrders()),
      disabled: !firstActive,
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
        {/* The first three tiles are filters — clicking one drives the orders
            panel below. Spent & Saved are running totals, not order lists, so
            they stay read-only. */}
        <div className="cons-kpis">
          <StatTile
            icon="🚚"
            label={t('consumer.home.activeOrders')}
            value={groups.active.length}
            hint={t('consumer.home.inProgress')}
            onClick={() => setFilter('active')}
            selected={filter === 'active'}
          />
          <StatTile
            icon="✅"
            label={t('consumer.home.completed')}
            value={groups.delivered.length}
            hint={t('consumer.home.delivered')}
            onClick={() => setFilter('completed')}
            selected={filter === 'completed'}
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
            onClick={() => setFilter('month')}
            selected={filter === 'month'}
          />
          <StatTile
            icon="💰"
            label={t('consumer.home.totalSpent', 'Total spent')}
            value={fmtMoney(totalSpent)}
            hint={t('consumer.home.totalSpentHint', 'On delivered orders')}
            accent="var(--info)"
          />
          <StatTile
            icon="🎉"
            label={t('consumer.home.totalSaved', 'Total saved')}
            value={fmtMoney(totalSaved)}
            hint={t('consumer.home.totalSavedHint', 'Across your orders')}
            accent="var(--forest)"
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
      ) : (
        <FadeIn delay={0.04}>
          <OrdersPanel
            filter={filter}
            active={groups.active}
            completed={groups.delivered}
            month={thisMonthOrders}
            onOpenOrder={onOpenOrder}
            onGoToOrders={onGoToOrders}
          />
        </FadeIn>
      )}

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
    </>
  );
}

/**
 * A titled orders table — used for the Completed and This-month tile views.
 *
 * The SAME orders rendered twice, and never both at once — the table from 1024px,
 * the phone's existing row list below that. Five columns do not fit a 390px phone
 * without a sideways scrollbar or type too small to read, and this portal is
 * phone-first while the mockup is a desktop comp; the sidebar drew the line in the
 * same place. Because CSS hides one outright, the reader gets one set of tab stops
 * rather than each order twice.
 */
function OrdersTable({
  orders,
  title,
  emptyText,
  onOpenOrder,
  onGoToOrders,
}: {
  orders: Order[];
  title: string;
  emptyText: string;
  onOpenOrder: (id: string) => void;
  onGoToOrders: () => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <section className="cons-recent">
      <div className="cons-recent__head">
        <h2 className="cons-section-title">{title}</h2>
        <button type="button" className="cons-recent__all" onClick={onGoToOrders}>
          {t('consumer.home.viewAllOrders', 'View all orders')} <span aria-hidden="true">→</span>
        </button>
      </div>

      {orders.length === 0 ? <EmptyState icon="📭">{emptyText}</EmptyState> : null}

      <div className="cons-recent__table" hidden={orders.length === 0}>
        <table>
          <caption className="sr-only">
            {t('consumer.home.recentOrdersCaption', 'Your most recent orders')}
          </caption>
          <thead>
            <tr>
              <th scope="col">{t('consumer.home.col.order', 'Order ID')}</th>
              <th scope="col">{t('consumer.home.col.date', 'Date')}</th>
              {/* The unit is the heading, so the cell is a bare number: it keeps the
                  column aligned, and it sidesteps pluralising "item" in two languages. */}
              <th scope="col" className="cons-recent__num">
                {t('consumer.home.col.items', 'Items')}
              </th>
              <th scope="col" className="cons-recent__num">
                {t('consumer.home.col.amount', 'Amount')}
              </th>
              <th scope="col">{t('consumer.home.col.status', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id}>
                <td>
                  {/* The control is the order code rather than the whole row: a <tr>
                      cannot be a button, and a click handler on one is invisible to a
                      keyboard — the same reason OrderRow is a real <button>. */}
                  <button
                    type="button"
                    className="cons-recent__id"
                    onClick={() => onOpenOrder(o.id)}
                  >
                    {orderLabel(o)}
                  </button>
                </td>
                <td className="cons-recent__date">{fmtDateShort(o.created_at, i18n.language)}</td>
                {/* An em-dash, not 0: item_count is absent for a role that did not ask
                    for it, and "0 items" would be a claim rather than a gap. */}
                <td className="cons-recent__num">{o.item_count ?? '—'}</td>
                <td className="cons-recent__num">{fmtMoney(o.total)}</td>
                <td>
                  <StatusBadge order={o} labelFor={(s) => t(statusKey(s), s)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="cons-recent__list" hidden={orders.length === 0}>
        {orders.map((o) => (
          <OrderRow key={o.id} order={o} onOpen={onOpenOrder} />
        ))}
      </div>
    </section>
  );
}

/**
 * The tile-driven orders panel. Shows ONLY the slice for the selected KPI tile —
 * Active renders in-flight tracking cards, Completed and This-month render the
 * titled table. This is the whole point of the redesign: a tile is a filter, and
 * the page shows one list at a time instead of stacking active + recent together.
 */
function OrdersPanel({
  filter,
  active,
  completed,
  month,
  onOpenOrder,
  onGoToOrders,
}: {
  filter: OrderFilter;
  active: Order[];
  completed: Order[];
  month: Order[];
  onOpenOrder: (id: string) => void;
  onGoToOrders: () => void;
}) {
  const { t } = useTranslation();

  if (filter === 'active') {
    return (
      <section>
        <div className="cons-recent__head">
          <h2 className="cons-section-title">{t('consumer.home.activeOrders')}</h2>
          <button type="button" className="cons-recent__all" onClick={onGoToOrders}>
            {t('consumer.home.viewAllOrders', 'View all orders')} <span aria-hidden="true">→</span>
          </button>
        </div>
        {active.length === 0 ? (
          <EmptyState icon="🌿">
            {t('consumer.home.noActive', 'No active orders right now.')}
          </EmptyState>
        ) : (
          active.map((o) => (
            <TrackingCard
              key={o.id}
              order={o}
              onOpen={onOpenOrder}
              trackLabel={t('consumer.home.track')}
            />
          ))
        )}
      </section>
    );
  }

  const isCompleted = filter === 'completed';
  return (
    <OrdersTable
      orders={(isCompleted ? completed : month).slice(0, PAST_PREVIEW)}
      title={isCompleted ? t('consumer.home.completed') : t('consumer.home.thisMonth')}
      emptyText={
        isCompleted
          ? t('consumer.home.noCompleted', 'No completed orders yet.')
          : t('consumer.home.noMonth', 'No orders placed this month.')
      }
      onOpenOrder={onOpenOrder}
      onGoToOrders={onGoToOrders}
    />
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
