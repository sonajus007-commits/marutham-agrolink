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
    // Selection first: with nothing ticked, "enter a reason" is the wrong nudge.
    if (selected.size === 0) return toast('Select at least one item', 'er');
    const trimmed = reason.trim();
    if (!trimmed) return toast('Please enter a reason', 'er');

    const chosen = [...selected].map((idx) => items[idx]);
    if (chosen.some((it) => !it.id)) {
      return toast('These items cannot be returned online. Please contact support.', 'er');
    }

    // Identify items by id only. The server owns price, name and the refund
    // amount; full_return is derived there from what we send.
    const lines: ReturnLine[] = chosen.map((it) => ({
      order_item_id: it.id as string,
      qty: it.qty,
      reason: trimmed,
    }));

    setBusy(true);
    try {
      const res = await api.requestReturn(order.id, { lines });
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
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy ? 'Submitting…' : 'Submit return'}
          </Button>
        </>
      }
    >
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
        <legend className="fl" style={{ marginBottom: 6 }}>
          Select items to return
        </legend>
        {items.map((it, idx) => (
          <label key={it.id || idx} className="ret-item">
            <input type="checkbox" checked={selected.has(idx)} onChange={() => toggle(idx)} />
            <span style={{ fontSize: 13 }}>
              {getProductEmoji(it.name)} {it.name}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--gray)' }}>
              {it.qty} {it.unit}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="fg">
        <label className="fl" htmlFor="return-reason">
          Reason <span className="rq">*</span>
        </label>
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
