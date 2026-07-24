import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@marutham/ui';
import { api, type PlaceOrderItem } from '@marutham/api-client';
import { fmtMoney, type CartBill } from '@marutham/lib';
import { useToast } from '../../components/Toast';

export function PaymentSheet({
  open,
  bill,
  items,
  address,
  onClose,
  onPlaced,
}: {
  open: boolean;
  /** The whole bill, not just the total — the charges are itemised below the amount
   *  so the customer can see what they are agreeing to pay before they commit. */
  bill: CartBill;
  items: PlaceOrderItem[];
  address: Record<string, unknown> | null;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [method, setMethod] = useState('UPI');

  /* `id` is the pay_method the API stores and prices off — never translated. The
   * brand names in `desc` are brands: they read the same in both languages. */
  const methods = useMemo(
    () => [
      { id: 'UPI', label: t('pay.upi', 'UPI'), desc: 'GPay, PhonePe, Paytm', icon: '📱' },
      {
        id: 'Card',
        label: t('consumer.pay.cardLong', 'Credit / Debit Card'),
        desc: 'Visa, Mastercard, RuPay',
        icon: '💳',
      },
      {
        id: 'Cash on Delivery',
        label: t('pay.cod', 'Cash on Delivery'),
        desc: t('consumer.pay.codDesc', 'Pay when your order arrives'),
        icon: '💵',
      },
    ],
    [t],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await api.placeOrder({
        items,
        pay_method: method,
        delivery_fee: bill.delivery,
        delivery_address: address,
      });
      toast(
        t('consumer.pay.placed', 'Order placed! {{code}}', { code: res.order.code || '' }).trim(),
        'ok',
      );
      onPlaced();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('consumer.pay.failed', 'Could not place order'));
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      title={t('consumer.pay.title', 'Payment')}
      onClose={onClose}
      backLabel={t('common.back', 'Back')}
    >
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--gray)' }}>
          {t('consumer.pay.amountPayable', 'Amount payable')}
        </div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--forest-soft)' }}>
          {fmtMoney(bill.total)}
        </div>
      </div>

      {/* What that figure is made of. The charges beyond the goods — handling and
          delivery — are named here rather than absorbed into the amount, so nobody
          reaches the payment screen wondering where the difference came from. */}
      <div className="ord-card" style={{ marginBottom: 16 }}>
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.itemTotal', 'Item Total')}</span>
          <span className="ival">{fmtMoney(bill.itemSubtotal)}</span>
        </div>
        {/* Every charge keeps its row even at zero — see the note in CartTab. This is
            the last screen before Pay Now, so it is the worst possible place for a
            charge to appear for the first time. */}
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.handling', 'Handling charges')}</span>
          <span className="ival">{fmtMoney(bill.handling)}</span>
        </div>
        <div className="irow">
          <span className="ilbl">
            {t('consumer.order.marketFee', 'Market fee')}{' '}
            <span style={{ fontSize: 10, color: 'var(--gray)' }}>
              ({t('consumer.order.multipleFarmers', 'multiple farmers')})
            </span>
          </span>
          <span className="ival">{fmtMoney(bill.marketFee)}</span>
        </div>
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.delivery', 'Delivery')}</span>
          <span className="ival">
            {bill.delivery === 0 ? (
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                {t('consumer.cart.free', 'FREE')}
              </span>
            ) : (
              fmtMoney(bill.delivery)
            )}
          </span>
        </div>
        <div className="irow" style={{ fontWeight: 800 }}>
          <span className="ilbl" style={{ color: 'var(--forest)', fontWeight: 800 }}>
            {t('consumer.cart.grandTotal', 'Grand Total')}
          </span>
          <span className="ival" style={{ color: 'var(--forest)', fontWeight: 800 }}>
            {fmtMoney(bill.total)}
          </span>
        </div>
      </div>

      {methods.map((m) => {
        const on = method === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`pay-method ${on ? 'on' : ''}`}
            onClick={() => setMethod(m.id)}
          >
            <div style={{ fontSize: 22 }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: 'var(--gray)' }}>{m.desc}</div>
            </div>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `2px solid ${on ? 'var(--forest-soft)' : 'var(--tint-300)'}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {on ? (
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--forest-soft)',
                  }}
                />
              ) : null}
            </div>
          </button>
        );
      })}

      {error ? (
        <div
          style={{
            background: 'var(--redbg)',
            color: 'var(--red)',
            fontSize: 12,
            fontWeight: 600,
            padding: '9px 12px',
            borderRadius: 8,
            margin: '10px 0',
          }}
        >
          {error}
        </div>
      ) : null}

      <button
        className="cons-btn-primary"
        style={{ marginTop: 12 }}
        onClick={confirm}
        disabled={busy}
      >
        {busy
          ? t('consumer.pay.placing', 'Placing order…')
          : method === 'Cash on Delivery'
            ? t('consumer.pay.placeCod', 'Place Order (COD)')
            : t('consumer.pay.payNow', 'Pay Now')}
      </button>
    </Sheet>
  );
}
