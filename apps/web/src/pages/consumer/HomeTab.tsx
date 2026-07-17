import { useTranslation } from 'react-i18next';
import { Button, EmptyState, OrderProgress, Spinner, StatTile, StatusBadge } from '@marutham/ui';
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

/** Past orders shown on Home before the user has to open the Orders tab. */
const PAST_PREVIEW = 4;

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

  // Recommended = products currently buyable (they have a live offer), with their best
  // consumer price via the same helpers the Shop uses (so the fee maths matches exactly).
  const recommended = products
    .map((p) => {
      const best = bestOffer(offersByProduct[p.id] || []);
      return best ? { product: p, price: offerConsumerPrice(best, p) } : null;
    })
    .filter((x): x is { product: Product; price: number } => x !== null)
    .slice(0, 8);

  // KPI row (mockup's dashboard header). All real, from order data — Wallet & Reward
  // Points are a Phase-2 feature and are intentionally not shown as fake numbers.
  const now = new Date();
  const thisMonth = orders.filter((o) => {
    const d = o.created_at ? new Date(o.created_at) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const totalSpent = groups.delivered.reduce((s, o) => s + (Number(o.total) || 0), 0);

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="cons-kpis">
        <StatTile
          label={t('consumer.home.activeOrders')}
          value={groups.active.length}
          hint={t('consumer.home.inProgress')}
        />
        <StatTile
          label={t('consumer.home.completed')}
          value={groups.delivered.length}
          hint={t('consumer.home.delivered')}
        />
        <StatTile
          label={t('consumer.home.thisMonth', 'Orders this month')}
          value={thisMonth}
          // The month name follows the UI language: interpolating an English
          // "July" into the Tamil sentence left it half-translated.
          hint={t('consumer.home.thisMonthHint', 'Placed in {{month}}', {
            month: now.toLocaleString(i18n.language, { month: 'long' }),
          })}
          accent="var(--accent)"
        />
        <StatTile
          label={t('consumer.home.totalSpent', 'Total spent')}
          value={fmtMoney(totalSpent)}
          hint={t('consumer.home.totalSpentHint', 'On delivered orders')}
          accent="var(--info)"
        />
      </div>

      {recommended.length > 0 ? (
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
      ) : null}

      {orders.length === 0 ? (
        <EmptyState icon="🌿">
          <p>{t('consumer.home.noOrders')}</p>
          <Button style={{ marginTop: 16 }} onClick={onGoToShop}>
            {t('consumer.home.shopNow')} →
          </Button>
        </EmptyState>
      ) : (
        <>
          {groups.active.length > 0 ? (
            <section>
              <h2 className="cons-section-title">{t('consumer.home.activeOrders')}</h2>
              {groups.active.map((o) => (
                <TrackingCard
                  key={o.id}
                  order={o}
                  onOpen={onOpenOrder}
                  trackLabel={t('consumer.home.track')}
                />
              ))}
            </section>
          ) : null}

          {groups.past.length > 0 ? (
            <RecentOrders
              orders={groups.past.slice(0, PAST_PREVIEW)}
              onOpenOrder={onOpenOrder}
              onGoToOrders={onGoToOrders}
            />
          ) : null}
        </>
      )}
    </>
  );
}

/**
 * The dashboard's Recent Orders (mockup panel 2).
 *
 * The SAME orders rendered twice, and never both at once — the table from 1024px,
 * the phone's existing row list below that. Five columns do not fit a 390px phone
 * without a sideways scrollbar or type too small to read, and this portal is
 * phone-first while the mockup is a desktop comp; the sidebar drew the line in the
 * same place. Because CSS hides one outright, the reader gets one set of tab stops
 * rather than each order twice.
 */
function RecentOrders({
  orders,
  onOpenOrder,
  onGoToOrders,
}: {
  orders: Order[];
  onOpenOrder: (id: string) => void;
  onGoToOrders: () => void;
}) {
  const { t, i18n } = useTranslation();

  return (
    <section className="cons-recent">
      <div className="cons-recent__head">
        <h2 className="cons-section-title">{t('consumer.home.recentOrders', 'Recent Orders')}</h2>
        <button type="button" className="cons-recent__all" onClick={onGoToOrders}>
          {t('consumer.home.viewAllOrders', 'View all orders')} <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="cons-recent__table">
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

      <div className="cons-recent__list">
        {orders.map((o) => (
          <OrderRow key={o.id} order={o} onOpen={onOpenOrder} />
        ))}
      </div>
    </section>
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
