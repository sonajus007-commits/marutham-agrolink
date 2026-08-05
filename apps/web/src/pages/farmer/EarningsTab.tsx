import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChartContainer, EmptyState, Modal, Spinner, StatTile } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  farmerEarnings,
  farmerWeeklyEarnings,
  isOrderActive,
  isOrderCancelled,
  payStatusKey,
  payoutMethodKey,
  subscriptionStatus,
  fmtMoney,
  fmtMoneyInt,
  fmtDateShort,
  type FarmerEarnings,
  type Order,
  type Payout,
  type SubscriptionStatus,
} from '@marutham/lib';
import { FarmerOrderSheet } from './FarmerOrderSheet';
import type { MyRatingsResponse } from '@marutham/api-client';
import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';
import { useAuth } from '../../auth/AuthContext';

export function EarningsTab({ onRenew }: { onRenew: () => void }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [ratings, setRatings] = useState<MyRatingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p] = await Promise.all([api.getOrders(), api.getPayouts()]);
      setOrders(o.orders || []);
      setPayouts(p.payouts || []);
      // Ratings are secondary: a failure here must not blank the whole earnings tab.
      api
        .getMyRatings()
        .then(setRatings)
        .catch(() => setRatings(null));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('farmer.earn.loadFailed', 'Could not load earnings'),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const earnings = useMemo(() => farmerEarnings(orders, payouts), [orders, payouts]);
  const sub = useMemo(() => subscriptionStatus(user || {}), [user]);

  // Which earnings tile's per-order breakdown popup is open, or null at rest.
  const [view, setView] = useState<EarnBucket | null>(null);
  // Which order's detail sheet is open (opened from a breakdown row).
  const [openOrder, setOpenOrder] = useState<Order | null>(null);

  // The four earnings buckets, each resolved to the orders that make up its total
  // — so a tile is not just a number but a distribution the seller can drill into.
  // Paid/pending come off the payout records; awaiting/in-flight off the orders.
  const breakdown = useMemo(() => {
    const rs = (v: unknown) => parseFloat(String(v ?? 0)) || 0;
    const ordersById = new Map(orders.map((o) => [o.id, o]));
    const settled = new Set(payouts.map((p) => p.order?.id).filter(Boolean));

    const fromPayout = (p: Payout): EarnRow => ({
      key: p.id,
      code: p.order?.code || (p.order?.id ? p.order.id.slice(0, 8).toUpperCase() : '—'),
      dateISO: p.paid_at || p.created_at,
      amount: rs(p.amount),
      order: p.order?.id ? ordersById.get(p.order.id) : undefined,
    });
    const fromOrder = (o: Order, when?: string | null): EarnRow => ({
      key: o.id,
      code: o.code || o.id.slice(0, 8).toUpperCase(),
      dateISO: when || o.created_at,
      amount: rs(o.farmer_payout),
      order: o,
    });

    return {
      paid: payouts.filter((p) => p.status === 'paid').map(fromPayout),
      pending: payouts.filter((p) => p.status === 'pending').map(fromPayout),
      awaiting: orders
        .filter((o) => o.status === 'Delivered' && !isOrderCancelled(o) && !settled.has(o.id))
        .map((o) => fromOrder(o, o.delivered_at)),
      inflight: orders.filter(isOrderActive).map((o) => fromOrder(o)),
    } satisfies Record<EarnBucket, EarnRow[]>;
  }, [orders, payouts]);

  // The bar labels follow the UI language — the axis was English on a Tamil page.
  const weekly = useMemo(
    () => farmerWeeklyEarnings(orders, 8, undefined, i18n.language),
    [orders, i18n.language],
  );
  const trendEmpty = useMemo(() => weekly.every((w) => w.amount === 0), [weekly]);
  const trendOption = useMemo<EChartsOption>(
    () => ({
      // One series → one colour, like the admin trend. ECharts reads only color[0].
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtMoney(v) },
      grid: { left: 56, right: 16, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: weekly.map((w) => w.rangeLabel),
        axisLabel: { interval: 0, fontSize: 10, hideOverlap: true },
        axisLine: { lineStyle: { color: colors.border } },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: colors.muted } },
        axisLabel: { formatter: (v: number) => fmtMoneyInt(v) },
      },
      series: [
        {
          name: t('farmer.earn.trend', 'Weekly earnings'),
          type: 'bar',
          data: weekly.map((w) => Math.round(w.amount)),
          itemStyle: { borderRadius: [6, 6, 0, 0] },
        },
      ],
    }),
    [weekly, t],
  );

  if (loading && orders.length === 0 && payouts.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      {sub.level !== 'none' ? <SubscriptionCard sub={sub} onRenew={onRenew} /> : null}

      <div className="fm-stats">
        <StatTile
          label={t('farmer.earn.paid')}
          value={fmtMoney(earnings.paid)}
          hint={t('farmer.earn.paidHint')}
          accent="var(--forest)"
          onClick={() => setView('paid')}
          selected={view === 'paid'}
        />
        <StatTile
          label={t('farmer.earn.pending')}
          value={fmtMoney(earnings.pending)}
          hint={t('farmer.earn.pendingHint')}
          accent="var(--warning-strong)"
          onClick={() => setView('pending')}
          selected={view === 'pending'}
        />
        <StatTile
          label={t('farmer.earn.awaiting')}
          value={fmtMoney(earnings.awaiting)}
          hint={t('farmer.earn.awaitingHint')}
          onClick={() => setView('awaiting')}
          selected={view === 'awaiting'}
        />
        <StatTile
          label={t('farmer.earn.inFlight')}
          value={fmtMoney(earnings.inFlight)}
          hint={t('farmer.earn.inFlightHint')}
          accent="var(--info)"
          onClick={() => setView('inflight')}
          selected={view === 'inflight'}
        />
      </div>

      <ChartContainer
        title={`📈 ${t('farmer.earn.trend', 'Weekly Earnings')}`}
        subtitle={t('farmer.earn.trendHint', 'Delivered earnings over the last 8 weeks')}
        height={260}
        empty={
          !loading && trendEmpty
            ? t(
                'farmer.earn.trendEmpty',
                'No delivered earnings yet — your weekly total will appear here.',
              )
            : false
        }
        summary={t('farmer.earn.trend', 'Weekly earnings')}
        className="fm-chart"
      >
        <EChart option={trendOption} height={260} />
      </ChartContainer>

      {ratings && ratings.total_ratings > 0 ? (
        <section className="fm-card">
          <h3>⭐ {t('farmer.earn.ratings', 'Customer Ratings')}</h3>
          <div className="fm-rating">
            <span className="fm-rating__score">{ratings.avg.toFixed(1)}</span>
            <span className="fm-rating__stars" aria-hidden="true">
              {'★★★★★'.slice(0, Math.round(ratings.avg))}
              <span className="fm-rating__starsoff">{'★★★★★'.slice(Math.round(ratings.avg))}</span>
            </span>
            <span className="fm-rating__count">
              {t('farmer.earn.ratingsCount', '{{count}} ratings', { count: ratings.total_ratings })}
            </span>
          </div>
          <ul className="fm-rating__list">
            {ratings.products.slice(0, 5).map((p) => (
              <li key={p.product} className="fm-rating__row">
                <span className="fm-rating__prod">{p.product}</span>
                <span className="fm-rating__prodscore">
                  ★ {p.avg.toFixed(1)} · {p.count}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="fm-card">
        <h3>💰 {t('farmer.earn.lifetime')}</h3>
        <div className="fm-lifetime">{fmtMoney(earnings.lifetime)}</div>
        <p className="fm-note">{t('farmer.earn.lifetimeNote')}</p>
      </section>

      <section className="fm-card">
        <h3>🧾 {t('farmer.earn.payouts')}</h3>
        {payouts.length === 0 ? (
          <p className="fm-note">{t('farmer.earn.noPayouts')}</p>
        ) : (
          <ul className="payout-list">
            {payouts.map((p) => (
              <li key={p.id} className="payout">
                <span className={`payout__dot payout__dot--${p.status}`} aria-hidden="true" />
                <span className="payout__main">
                  <span className="payout__order">{p.order?.code || '—'}</span>
                  <span className="payout__meta">
                    {fmtDateShort(p.paid_at || p.created_at, i18n.language)}
                    {p.method ? ` · ${t(payoutMethodKey(p.method), p.method)}` : ''}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                </span>
                <span className="payout__right">
                  <span className="payout__amt">{fmtMoney(p.amount)}</span>
                  <span className={`payout__status payout__status--${p.status}`}>
                    {t(payStatusKey(p.status), p.status)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <EarnBreakdownModal
        view={view}
        rows={view ? breakdown[view] : []}
        total={view ? earnings[EARN_TOTAL_KEY[view]] : 0}
        onClose={() => setView(null)}
        onOpenOrder={(o) => {
          setView(null);
          setOpenOrder(o);
        }}
      />

      <FarmerOrderSheet
        order={openOrder}
        open={openOrder !== null}
        onClose={() => setOpenOrder(null)}
        onChanged={load}
      />
    </>
  );
}

/** The four settlement buckets a tile can drill into. */
type EarnBucket = 'paid' | 'pending' | 'awaiting' | 'inflight';

/** One order's contribution to a bucket's total. */
interface EarnRow {
  key: string;
  code: string;
  dateISO?: string | null;
  amount: number;
  /** The full order, when known — lets the row open the detail sheet. */
  order?: Order;
}

/** Bucket → the matching total field on FarmerEarnings. */
const EARN_TOTAL_KEY: Record<EarnBucket, keyof FarmerEarnings> = {
  paid: 'paid',
  pending: 'pending',
  awaiting: 'awaiting',
  inflight: 'inFlight',
};

/** Bucket → its popup title i18n key. */
const EARN_TITLE_KEY: Record<EarnBucket, string> = {
  paid: 'farmer.earn.bk.paid',
  pending: 'farmer.earn.bk.pending',
  awaiting: 'farmer.earn.bk.awaiting',
  inflight: 'farmer.earn.bk.inflight',
};

/**
 * The per-order breakdown popup for an earnings tile — the money in that bucket
 * distributed across the orders that make it up, each row showing the order code,
 * its date, and the amount. Rows backed by a known order open its detail sheet.
 */
function EarnBreakdownModal({
  view,
  rows,
  total,
  onClose,
  onOpenOrder,
}: {
  view: EarnBucket | null;
  rows: EarnRow[];
  total: number;
  onClose: () => void;
  onOpenOrder: (o: Order) => void;
}) {
  const { t, i18n } = useTranslation();
  return (
    <Modal
      open={view !== null}
      title={view ? t(EARN_TITLE_KEY[view]) : ''}
      subtitle={t('farmer.earn.bk.total', 'Total {{amount}}', { amount: fmtMoney(total) })}
      onClose={onClose}
      closeLabel={t('common.close', 'Close')}
    >
      {rows.length === 0 ? (
        <EmptyState icon="🌾">
          {t('farmer.earn.bk.empty', 'No orders in this bucket yet.')}
        </EmptyState>
      ) : (
        <div className="fm-recent__list">
          {rows.map((r) => {
            const inner = (
              <>
                <span className="flex min-w-0 flex-1 flex-col justify-center">
                  <span className="text-sm font-bold text-primary">{r.code}</span>
                  <span className="text-2xs text-fg-muted">
                    {fmtDateShort(r.dateISO, i18n.language)}
                  </span>
                </span>
                <span className="text-sm font-bold">{fmtMoney(r.amount)}</span>
              </>
            );
            return r.order ? (
              <button
                key={r.key}
                type="button"
                onClick={() => r.order && onOpenOrder(r.order)}
                className="flex w-full items-center gap-3 rounded-base border border-border-subtle bg-surface p-3 text-left transition-colors hover:bg-surface-muted"
              >
                {inner}
              </button>
            ) : (
              <div
                key={r.key}
                className="flex w-full items-center gap-3 rounded-base border border-border-subtle bg-surface p-3"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function SubscriptionCard({ sub, onRenew }: { sub: SubscriptionStatus; onRenew: () => void }) {
  const { t, i18n } = useTranslation();
  const icon = sub.level === 'expired' ? '🔒' : sub.level === 'expiring' ? '⚠️' : '✅';
  const label =
    sub.level === 'expired'
      ? t('farmer.sub.expired')
      : sub.level === 'expiring'
        ? t('farmer.sub.expiringIn', { count: sub.daysLeft ?? 0 })
        : t('farmer.sub.active');

  return (
    <section className={`fm-sub fm-sub--${sub.level}`}>
      <div>
        <div className="fm-sub__label">📅 {t('farmer.sub.title')}</div>
        {/* The plan NAME is the value the server prices off — only spoken here. */}
        <div className="fm-sub__plan">
          {sub.plan
            ? t(`farmer.sub.plan.${sub.plan.replace(/\s+/g, '').toLowerCase()}`, sub.plan)
            : '—'}
        </div>
        {sub.expiresAt ? (
          <div className="fm-sub__valid">
            {t('farmer.sub.validUntil')} {fmtDateShort(sub.expiresAt, i18n.language)}
          </div>
        ) : null}
      </div>
      <div className="fm-sub__right">
        <div className="fm-sub__icon" aria-hidden="true">
          {icon}
        </div>
        <div className="fm-sub__status">{label}</div>
        {sub.level === 'expired' || sub.level === 'expiring' ? (
          <Button className="fm-sub__btn" onClick={onRenew}>
            {t('farmer.sub.renew')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
