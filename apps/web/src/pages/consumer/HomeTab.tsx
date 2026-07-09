import { useTranslation } from 'react-i18next';
import { Button, EmptyState, OrderProgress, Spinner, StatTile } from '@marutham/ui';
import { buildPipeline, fmtDateShort, fmtMoney, statusColor, type Order } from '@marutham/lib';
import { useOrders } from './OrdersContext';
import { OrderRow, orderLabel } from './OrderRow';

/** Past orders shown on Home before the user has to open the Orders tab. */
const PAST_PREVIEW = 4;

export function HomeTab({ onOpenOrder, onGoToShop }: { onOpenOrder: (id: string) => void; onGoToShop: () => void }) {
  const { t } = useTranslation();
  const { orders, groups, loading, error } = useOrders();

  if (loading && orders.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <div className="cons-stats">
        <StatTile label={t('consumer.home.activeOrders')} value={groups.active.length} hint={t('consumer.home.inProgress')} />
        <StatTile label={t('consumer.home.completed')} value={groups.delivered.length} hint={t('consumer.home.delivered')} />
      </div>

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
