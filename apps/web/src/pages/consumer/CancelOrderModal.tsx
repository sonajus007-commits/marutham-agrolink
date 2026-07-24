import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Modal } from '@marutham/ui';
import { api } from '@marutham/api-client';
import type { Order } from '@marutham/lib';
import { useToast } from '../../components/Toast';

export function CancelOrderModal({
  order,
  sellerName,
  open,
  onClose,
  onCancelled,
}: {
  order: Order;
  /**
   * Set when `order` is ONE seller's part of a multi-vendor order. The rest of the
   * order keeps going, so the modal must not promise to cancel the whole thing —
   * and the refund is only for this seller's goods.
   */
  sellerName?: string;
  open: boolean;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.cancelOrder(order.id, reason.trim());
      toast(t('consumer.cancel.done', 'Order cancelled.'), 'ok');
      onCancelled();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('consumer.cancel.failed', 'Could not cancel order'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      title={
        sellerName
          ? t('consumer.cancel.titlePart', 'Cancel this part?')
          : t('consumer.cancel.title', 'Cancel this order?')
      }
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('consumer.cancel.keep', 'Keep order')}
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy}>
            {busy
              ? t('consumer.cancel.busy', 'Cancelling…')
              : t('consumer.cancel.confirm', 'Cancel order')}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.6, marginBottom: 12 }}>
        {sellerName ? (
          <Trans
            i18nKey="consumer.cancel.bodyPart"
            values={{ seller: sellerName }}
            defaults="<1>{{seller}}</1>'s items will be cancelled. The rest of your order is not affected and is still on its way."
            components={{ 1: <strong /> }}
          />
        ) : (
          <Trans
            i18nKey="consumer.cancel.body"
            values={{ code: order.code || order.id.slice(0, 8).toUpperCase() }}
            defaults="Order <1>{{code}}</1> will be cancelled."
            components={{ 1: <strong /> }}
          />
        )}
        {order.pay_status === 'paid'
          ? ` ${
              sellerName
                ? t('consumer.cancel.refundPart', 'You will be refunded for this seller’s items.')
                : t(
                    'consumer.cancel.refund',
                    'Your payment will be refunded to the original payment method.',
                  )
            }`
          : ''}
      </p>
      <div className="fg">
        <label className="fl" htmlFor="cancel-reason">
          {t('consumer.cancel.reason', 'Reason')}{' '}
          <span style={{ fontWeight: 400, color: 'var(--gray)' }}>
            ({t('common.optional', 'optional')})
          </span>
        </label>
        <textarea
          id="cancel-reason"
          className="cons-input"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('consumer.cancel.reasonPlaceholder', 'Why are you cancelling?')}
        />
      </div>
    </Modal>
  );
}
