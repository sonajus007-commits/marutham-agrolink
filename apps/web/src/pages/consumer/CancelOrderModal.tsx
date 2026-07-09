import { useState } from 'react';
import { Button, Modal } from '@marutham/ui';
import { api } from '@marutham/api-client';
import type { Order } from '@marutham/lib';
import { useToast } from '../../components/Toast';

export function CancelOrderModal({
  order,
  open,
  onClose,
  onCancelled,
}: {
  order: Order;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.cancelOrder(order.id, reason.trim());
      toast('Order cancelled.', 'ok');
      onCancelled();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not cancel order', 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Cancel this order?"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Keep order</Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy ? 'Cancelling…' : 'Cancel order'}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.6, marginBottom: 12 }}>
        Order <strong>{order.code || order.id.slice(0, 8).toUpperCase()}</strong> will be cancelled.
        {order.pay_status === 'paid' ? ' Your payment will be refunded to the original payment method.' : ''}
      </p>
      <div className="fg">
        <label className="fl" htmlFor="cancel-reason">Reason <span style={{ fontWeight: 400, color: 'var(--gray)' }}>(optional)</span></label>
        <textarea
          id="cancel-reason"
          className="cons-input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why are you cancelling?"
        />
      </div>
    </Modal>
  );
}
