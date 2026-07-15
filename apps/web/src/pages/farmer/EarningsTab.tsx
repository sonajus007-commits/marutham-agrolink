import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, ChartContainer, EmptyState, Spinner, StatTile } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  farmerEarnings,
  farmerWeeklyEarnings,
  subscriptionStatus,
  fmtMoney,
  fmtMoneyInt,
  fmtDateShort,
  type Order,
  type Payout,
  type SubscriptionStatus,
} from '@marutham/lib';
import type { MyRatingsResponse } from '@marutham/api-client';
import { chartPalette, colors } from '@marutham/tokens';
import type { EChartsOption } from 'echarts';
import { EChart } from '../../components/EChart';
import { useAuth } from '../../auth/AuthContext';

export function EarningsTab({ onRenew }: { onRenew: () => void }) {
  const { t } = useTranslation();
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
      setError(e instanceof Error ? e.message : 'Could not load earnings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const earnings = useMemo(() => farmerEarnings(orders, payouts), [orders, payouts]);
  const sub = useMemo(() => subscriptionStatus(user || {}), [user]);

  const weekly = useMemo(() => farmerWeeklyEarnings(orders, 8), [orders]);
  const trendEmpty = useMemo(() => weekly.every((w) => w.amount === 0), [weekly]);
  const trendOption = useMemo<EChartsOption>(
    () => ({
      // One series → one colour, like the admin trend. ECharts reads only color[0].
      color: [chartPalette.light[0]],
      tooltip: { trigger: 'axis', valueFormatter: (v) => fmtMoney(v) },
      grid: { left: 56, right: 16, top: 20, bottom: 28 },
      xAxis: {
        type: 'category',
        data: weekly.map((w) => w.label),
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
        />
        <StatTile
          label={t('farmer.earn.pending')}
          value={fmtMoney(earnings.pending)}
          hint={t('farmer.earn.pendingHint')}
          accent="var(--warning-strong)"
        />
        <StatTile
          label={t('farmer.earn.awaiting')}
          value={fmtMoney(earnings.awaiting)}
          hint={t('farmer.earn.awaitingHint')}
        />
        <StatTile
          label={t('farmer.earn.inFlight')}
          value={fmtMoney(earnings.inFlight)}
          hint={t('farmer.earn.inFlightHint')}
          accent="var(--info)"
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
                    {fmtDateShort(p.paid_at || p.created_at)}
                    {p.method ? ` · ${p.method}` : ''}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </span>
                </span>
                <span className="payout__right">
                  <span className="payout__amt">{fmtMoney(p.amount)}</span>
                  <span className={`payout__status payout__status--${p.status}`}>{p.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function SubscriptionCard({ sub, onRenew }: { sub: SubscriptionStatus; onRenew: () => void }) {
  const { t } = useTranslation();
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
        <div className="fm-sub__plan">{sub.plan || '—'}</div>
        {sub.expiresAt ? (
          <div className="fm-sub__valid">
            {t('farmer.sub.validUntil')} {fmtDateShort(sub.expiresAt)}
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
