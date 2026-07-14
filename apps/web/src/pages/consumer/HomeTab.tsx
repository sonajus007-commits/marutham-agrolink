import { useTranslation } from 'react-i18next';
import { Button, EmptyState, OrderProgress, Spinner, StatTile } from '@marutham/ui';
import {
  buildPipeline, fmtDateShort, fmtMoney, statusColor,
  bestOffer, offerConsumerPrice, getProductEmoji, type Order, type Product,
} from '@marutham/lib';
import { useOrders } from './OrdersContext';
import { useConsumerData } from './ConsumerDataContext';
import { OrderRow, orderLabel } from './OrderRow';

/** Past orders shown on Home before the user has to open the Orders tab. */
const PAST_PREVIEW = 4;

export function HomeTab({ onOpenOrder, onGoToShop }: { onOpenOrder: (id: string) => void; onGoToShop: () => void }) {
  const { t } = useTranslation();
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
        <StatTile label={t('consumer.home.activeOrders')} value={groups.active.length} hint={t('consumer.home.inProgress')} />
        <StatTile label={t('consumer.home.completed')} value={groups.delivered.length} hint={t('consumer.home.delivered')} />
        <StatTile label={t('consumer.home.thisMonth', 'Orders this month')} value={thisMonth} hint={t('consumer.home.thisMonthHint', 'Placed in {{month}}', { month: now.toLocaleString('en', { month: 'long' }) })} accent="var(--accent)" />
        <StatTile label={t('consumer.home.totalSpent', 'Total spent')} value={fmtMoney(totalSpent)} hint={t('consumer.home.totalSpentHint', 'On delivered orders')} accent="var(--info)" />
      </div>

      {recommended.length > 0 ? (
        <section className="cons-reco">
          <div className="cons-reco__head">
            <h2 className="cons-section-title">{t('consumer.home.recommended', 'Recommended for You')}</h2>
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
                <span className="cons-reco__emoji" aria-hidden="true">{getProductEmoji(product.name)}</span>
                <span className="cons-reco__name">{product.name}</span>
                <span className="cons-reco__price">{t('consumer.home.from', 'from')} {fmtMoney(price)}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {orders.length === 0 ? (
        <EmptyState icon="🌿">
          <p>{t('consumer.home.noOrders')}</p>
          <Button style={{ marginTop: 16 }} onClick={onGoToShop}>{t('consumer.home.shopNow')} →</Button>
        </EmptyState>
      ) : (
        <>
          {groups.active.length > 0 ? (
            <section>
              <h2 className="cons-section-title">{t('consumer.home.activeOrders')}</h2>
              {groups.active.map((o) => (
                <TrackingCard key={o.id} order={o} onOpen={onOpenOrder} trackLabel={t('consumer.home.track')} />
              ))}
            </section>
          ) : null}

          {groups.past.length > 0 ? (
            <section className="ord-card">
              <h3>📦 {t('consumer.home.pastOrders')}</h3>
              {groups.past.slice(0, PAST_PREVIEW).map((o) => (
                <OrderRow key={o.id} order={o} onOpen={onOpenOrder} />
              ))}
            </section>
          ) : null}
        </>
      )}
    </>
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
function TrackingCard({ order: o, onOpen, trackLabel }: { order: Order; onOpen: (id: string) => void; trackLabel: string }) {
  return (
    <article className="track-card" style={{ borderLeftColor: statusColor(o.status) }}>
      <div className="track-card__top">
        <div>
          <span className="ord-id">{orderLabel(o)}</span>
          <span className="ord-loc">
            {fmtDateShort(o.created_at)}{o.agent_name ? ` · 🛵 ${o.agent_name}` : ''}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="ord-amt">{fmtMoney(o.total)}</span>
          {o.pay_method ? <span className="ord-item__pay">{o.pay_method}</span> : null}
        </div>
      </div>

      <OrderProgress nodes={buildPipeline(o.route || 'direct', o.status)} />

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
