import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaymentBadge } from '@marutham/ui';
import { fmtMoney, pickupAssignment, resolveAddress, type Order } from '@marutham/lib';

export type QueueAction = 'verify' | 'pickup' | 'transit' | 'deliver' | 'view';

interface QueueSectionProps {
  title: string;
  orders: Order[];
  action: QueueAction;
  sectionClass: string;
  btnLabel: string;
  onOpenView: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onOpenVerify: (id: string) => void;
  onQuickScan: (id: string) => Promise<void>;
  /** Show who is collecting a verified parcel (and whether they accepted). */
  showAssignment?: boolean;
  /** VCO: (re)pick the pickup agent of a verified parcel. */
  onAssign?: (order: Order) => void;
}

function OrderCard({
  order,
  action,
  btnLabel,
  onOpenView,
  onOpenDeliver,
  onOpenVerify,
  onQuickScan,
  showAssignment,
  onAssign,
}: {
  order: Order;
  action: QueueAction;
  btnLabel: string;
  onOpenView: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onOpenVerify: (id: string) => void;
  onQuickScan: (id: string) => Promise<void>;
  showAssignment?: boolean;
  onAssign?: (order: Order) => void;
}) {
  const { t } = useTranslation();
  const asg = showAssignment ? pickupAssignment(order) : null;
  const [busy, setBusy] = useState(false);
  const code = order.code || order.id.slice(0, 8).toUpperCase();
  const addr = resolveAddress(order.delivery_address);

  async function quick(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await onQuickScan(order.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="delv-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenView(order.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpenView(order.id);
      }}
    >
      <div className="delv-card__code">{code}</div>
      <div className="delv-card__name">
        {order.consumer_name || t('agent.consumer', 'Consumer')}
      </div>
      {addr ? <div className="delv-card__addr">{addr}</div> : null}
      {asg ? (
        <div className={`delv-card__assign delv-card__assign--${asg.state}`}>
          {asg.state === 'none'
            ? `⚠ ${t('agent.job.noAgent', 'No agent yet')}`
            : asg.state === 'pending'
              ? `⏳ ${t('agent.job.waiting', 'Waiting for {{name}} · {{min}} min left', {
                  name: asg.name,
                  min: asg.minutesLeft ?? 0,
                })}`
              : `✓ ${t('agent.job.accepted', '{{name}} accepted', { name: asg.name })}`}
          {onAssign ? (
            <button
              type="button"
              className="delv-card__btn delv-card__btn--ghost"
              style={{ marginLeft: 8, padding: '3px 10px' }}
              onClick={(e) => {
                e.stopPropagation();
                onAssign(order);
              }}
            >
              {asg.state === 'none'
                ? t('agent.job.assign', 'Assign')
                : t('agent.job.reassign', 'Change')}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="delv-card__meta">
        <div className="delv-card__pay">{fmtMoney(order.total)}</div>
        <PaymentBadge
          method={order.pay_method}
          labels={{ cod: t('agent.cod', 'COD'), upi: t('pay.upi', 'UPI') }}
        />
        {action === 'view' ? (
          <span className="delv-card__view">{t('consumer.card.view', 'View')} →</span>
        ) : action === 'deliver' ? (
          <button
            className="delv-card__btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenDeliver(order.id);
            }}
          >
            {btnLabel}
          </button>
        ) : action === 'verify' ? (
          <button
            className="delv-card__btn"
            onClick={(e) => {
              e.stopPropagation();
              onOpenVerify(order.id);
            }}
          >
            {btnLabel}
          </button>
        ) : (
          <button className="delv-card__btn" onClick={quick} disabled={busy}>
            {busy ? '⏳…' : btnLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function QueueSection(props: QueueSectionProps) {
  const { title, orders, sectionClass } = props;
  if (orders.length === 0) return null;
  return (
    <div className={`q-section ${sectionClass}`}>
      <div className="q-head">
        <div className="q-label">{title}</div>
        <div className="q-count">{orders.length}</div>
      </div>
      {orders.map((o) => (
        <OrderCard key={o.id} order={o} {...props} />
      ))}
    </div>
  );
}
