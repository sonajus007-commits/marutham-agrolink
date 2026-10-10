import { useTranslation } from 'react-i18next';
import { Sheet } from '@marutham/ui';
import { fmtMoney, type Order } from '@marutham/lib';

/* The thank-you screen after Pay Now. A toast vanished in three seconds and took the
 * order code with it; this stays until the customer chooses where to go next, so the
 * code they may need to quote to support is on screen long enough to note down.
 * Closing it leaves them on the Orders tab, where the new order already sits. */
export function OrderPlacedSheet({
  order,
  onClose,
  onViewOrder,
  onContinue,
}: {
  order: Order | null;
  onClose: () => void;
  onViewOrder: (id: string) => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const cod = order?.pay_method === 'Cash on Delivery';

  return (
    <Sheet
      open={order !== null}
      title={t('consumer.placed.title', 'Order placed')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      {order ? (
        <div style={{ textAlign: 'center', padding: '24px 4px' }}>
          <div style={{ fontSize: 56 }} aria-hidden="true">
            ✅
          </div>
          <h2
            style={{ fontSize: 22, fontWeight: 800, color: 'var(--forest)', margin: '12px 0 6px' }}
          >
            {t('consumer.placed.thanks', 'Thank you for your order!')}
          </h2>
          <p style={{ fontSize: 13, color: 'var(--gray)', margin: '0 0 20px' }}>
            {t(
              'consumer.placed.sub',
              'Your farmers have been told. You will get a notification as it is packed and on its way.',
            )}
          </p>

          <div className="ord-card" style={{ marginBottom: 20, textAlign: 'left' }}>
            {order.code ? (
              <div className="irow">
                <span className="ilbl">{t('consumer.placed.code', 'Order number')}</span>
                <span className="ival" style={{ fontWeight: 800 }}>
                  {order.code}
                </span>
              </div>
            ) : null}
            {order.total != null ? (
              <div className="irow">
                <span className="ilbl">{t('consumer.cart.grandTotal', 'Grand Total')}</span>
                <span className="ival" style={{ fontWeight: 800 }}>
                  {fmtMoney(Number(order.total))}
                </span>
              </div>
            ) : null}
            {order.pay_method ? (
              <div className="irow">
                <span className="ilbl">{t('consumer.placed.payment', 'Payment')}</span>
                <span className="ival">
                  {cod ? t('pay.cod', 'Cash on Delivery') : order.pay_method}
                </span>
              </div>
            ) : null}
          </div>

          <button className="cons-btn-primary" onClick={() => onViewOrder(order.id)}>
            {t('consumer.placed.track', 'Track my order')}
          </button>
          <button
            type="button"
            onClick={onContinue}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '12px 0',
              background: 'none',
              border: 0,
              color: 'var(--forest-soft)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('consumer.placed.continue', 'Continue shopping')}
          </button>
        </div>
      ) : null}
    </Sheet>
  );
}
