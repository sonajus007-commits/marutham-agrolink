import { useTranslation } from 'react-i18next';
import { PaymentBadge } from '@marutham/ui';
import { fmtMoney, type Order } from '@marutham/lib';

export function DeliveredList({ orders, onOpenView }: { orders: Order[]; onOpenView: (id: string) => void }) {
  const { t } = useTranslation();
  if (orders.length === 0) return null;
  return (
    <div>
      <div className="section-cap">✅ {t('agent.completedToday')}</div>
      {orders.map((o) => {
        const code = o.code || o.id.slice(0, 8).toUpperCase();
        return (
          <div
            key={o.id}
            className="done-card"
            role="button"
            tabIndex={0}
            onClick={() => onOpenView(o.id)}
            onKeyDown={(e) => { if (e.key === 'Enter') onOpenView(o.id); }}
          >
            <div style={{ fontSize: 18 }}>✅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--leaf)' }}>{code}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)' }}>{o.consumer_name || 'Consumer'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 800, color: 'var(--forest)' }}>{fmtMoney(o.total)}</div>
              <PaymentBadge method={o.pay_method} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
