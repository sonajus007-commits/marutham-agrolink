import { useState } from 'react';
import { Sheet } from '@marutham/ui';
import { api, type PlaceOrderItem } from '@marutham/api-client';
import { fmtMoney } from '@marutham/lib';
import { useToast } from '../../components/Toast';

const METHODS = [
  { id: 'UPI', label: 'UPI', desc: 'GPay, PhonePe, Paytm', icon: '📱' },
  { id: 'Card', label: 'Credit / Debit Card', desc: 'Visa, Mastercard, RuPay', icon: '💳' },
  { id: 'Cash on Delivery', label: 'Cash on Delivery', desc: 'Pay when your order arrives', icon: '💵' },
];

export function PaymentSheet({
  open, amount, items, address, deliveryFee, onClose, onPlaced,
}: {
  open: boolean;
  amount: number;
  items: PlaceOrderItem[];
  address: Record<string, unknown> | null;
  deliveryFee: number;
  onClose: () => void;
  onPlaced: () => void;
}) {
  const toast = useToast();
  const [method, setMethod] = useState('UPI');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await api.placeOrder({ items, pay_method: method, delivery_fee: deliveryFee, delivery_address: address });
      toast(`Order placed! ${res.order.code || ''}`, 'ok');
      onPlaced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not place order');
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} title="Payment" onClose={onClose}>
      <div style={{ textAlign: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--gray)' }}>Amount payable</div>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--forest-soft)' }}>{fmtMoney(amount)}</div>
      </div>

      {METHODS.map((m) => {
        const on = method === m.id;
        return (
          <button key={m.id} type="button" className={`pay-method ${on ? 'on' : ''}`} onClick={() => setMethod(m.id)}>
            <div style={{ fontSize: 22 }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: '#7a8492' }}>{m.desc}</div>
            </div>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${on ? 'var(--forest-soft)' : '#cbd5cb'}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {on ? <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--forest-soft)' }} /> : null}
            </div>
          </button>
        );
      })}

      {error ? <div style={{ background: 'var(--redbg)', color: 'var(--red)', fontSize: 12, fontWeight: 600, padding: '9px 12px', borderRadius: 8, margin: '10px 0' }}>{error}</div> : null}

      <button className="cons-btn-primary" style={{ marginTop: 12 }} onClick={confirm} disabled={busy}>
        {busy ? 'Placing order…' : method === 'Cash on Delivery' ? 'Place Order (COD)' : 'Pay Now'}
      </button>
    </Sheet>
  );
}
