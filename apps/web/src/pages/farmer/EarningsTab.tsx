import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, Spinner, StatTile } from '@marutham/ui';
import { api } from '@marutham/api-client';
import {
  farmerEarnings, subscriptionStatus, fmtMoney, fmtDateShort,
  type Order, type Payout, type SubscriptionStatus,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';

export function EarningsTab({ onRenew }: { onRenew: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [o, p] = await Promise.all([api.getOrders(), api.getPayouts()]);
      setOrders(o.orders || []);
      setPayouts(p.payouts || []);
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

  if (loading && orders.length === 0 && payouts.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      {sub.level !== 'none' ? <SubscriptionCard sub={sub} onRenew={onRenew} /> : null}

      <div className="fm-stats">
        <StatTile label={t('farmer.earn.paid')} value={fmtMoney(earnings.paid)} hint={t('farmer.earn.paidHint')} />
        <StatTile label={t('farmer.earn.pending')} value={fmtMoney(earnings.pending)} hint={t('farmer.earn.pendingHint')} accent="var(--warning-strong)" />
        <StatTile label={t('farmer.earn.awaiting')} value={fmtMoney(earnings.awaiting)} hint={t('farmer.earn.awaitingHint')} />
        <StatTile label={t('farmer.earn.inFlight')} value={fmtMoney(earnings.inFlight)} hint={t('farmer.earn.inFlightHint')} accent="var(--info)" />
      </div>

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
          <div className="fm-sub__valid">{t('farmer.sub.validUntil')} {fmtDateShort(sub.expiresAt)}</div>
        ) : null}
      </div>
      <div className="fm-sub__right">
        <div className="fm-sub__icon" aria-hidden="true">{icon}</div>
        <div className="fm-sub__status">{label}</div>
        {sub.level === 'expired' || sub.level === 'expiring' ? (
          <Button className="fm-sub__btn" onClick={onRenew}>{t('farmer.sub.renew')}</Button>
        ) : null}
      </div>
    </section>
  );
}
