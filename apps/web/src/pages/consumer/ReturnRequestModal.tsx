import { useState } from 'react';
import { Button, Modal } from '@marutham/ui';
import { api, type ReturnLine } from '@marutham/api-client';
import { getProductEmoji, type Order, type OrderItem } from '@marutham/lib';
import { useToast } from '../../components/Toast';

export function ReturnRequestModal({
  order,
  items,
  open,
  onClose,
  onSubmitted,
}: {
  order: Order;
  items: OrderItem[];
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  function toggle(idx: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) return toast('Please enter a reason', 'er');
    if (selected.size === 0) return toast('Select at least one item', 'er');

    const lines: ReturnLine[] = [...selected].map((idx) => {
      const it = items[idx];
      return {
        product_code: it.product_code || '',
        name: it.name,
        farmer_name: it.farmer_name || '',
        qty: it.qty,
        unit: it.unit,
        price: it.price,
        reason: trimmed,
      };
    });

    setBusy(true);
    try {
      const res = await api.requestReturn(order.id, { full_return: lines.length === items.length, lines });
      toast(`Return ${res.code} submitted!`, 'ok');
      onSubmitted();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not submit return', 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title="Request return / refund"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit return'}
          </Button>
        </>
      }
    >
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
        <legend className="fl" style={{ marginBottom: 6 }}>Select items to return</legend>
        {items.map((it, idx) => (
          <label key={it.id || idx} className="ret-item">
            <input type="checkbox" checked={selected.has(idx)} onChange={() => toggle(idx)} />
            <span style={{ fontSize: 13 }}>{getProductEmoji(it.name)} {it.name}</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray)' }}>
              {it.qty} {it.unit}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="fg">
        <label className="fl" htmlFor="return-reason">Reason <span className="rq">*</span></label>
        <textarea
          id="return-reason"
          className="cons-input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Damaged, wrong item, quality issue…"
        />
      </div>
    </Modal>
  );
}
