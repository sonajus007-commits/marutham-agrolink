import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Spinner, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api, type SupportTicket, type SupportStatus } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { useToast } from './Toast';

/* Self-contained Help & Support panel: raise a ticket, then track it. Dropped into
 * a portal (consumer profile today; usable by any signed-in role). Staff work the
 * tickets from the admin Support queue; a status change or reply lands in the user's
 * notification bell (migration 055 + 053). */

const STATUS_TONE: Record<SupportStatus, string> = {
  open: 'var(--sun)',
  in_progress: 'var(--sun)',
  resolved: 'var(--green)',
};

export function HelpSupport() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [raising, setRaising] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getSupportTickets();
      setTickets(res.tickets || []);
    } catch {
      /* best-effort — the raise button still works */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = (s: SupportStatus) =>
    t(
      'support.status.' + s,
      s === 'in_progress' ? 'In progress' : s === 'resolved' ? 'Resolved' : 'Open',
    );

  return (
    <section className="ord-card">
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <h3 style={{ margin: 0 }}>🎧 {t('support.title', 'Help & Support')}</h3>
        <Button onClick={() => setRaising(true)}>{t('support.raise', 'Contact support')}</Button>
      </div>
      <p style={{ margin: '6px 0 12px', fontSize: 13, color: 'var(--muted)' }}>
        {t(
          'support.blurb',
          'Have a problem with an order or your account? Send us a message and we’ll help.',
        )}
      </p>

      {loading ? (
        <Spinner />
      ) : tickets.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t('support.none', 'No requests yet.')}
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tickets.map((tk) => (
            <div
              key={tk.id}
              style={{
                border: '1px solid var(--border-subtle)',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{tk.subject}</strong>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: STATUS_TONE[tk.status],
                  }}
                >
                  {statusLabel(tk.status)}
                </span>
              </div>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--gray)' }}>
                {tk.message}
              </p>
              {tk.admin_note ? (
                <p
                  style={{
                    margin: '8px 0 0',
                    fontSize: 12.5,
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: 'var(--surface-muted)',
                  }}
                >
                  <strong>{t('support.reply', 'Support')}: </strong>
                  {tk.admin_note}
                </p>
              ) : null}
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>
                {fmtDateShort(tk.created_at, i18n.language)}
              </div>
            </div>
          ))}
        </div>
      )}

      <RaiseModal
        open={raising}
        onClose={() => setRaising(false)}
        onDone={() => {
          setRaising(false);
          void load();
        }}
        onError={(m) => toast(m, 'er')}
        onOk={(m) => toast(m, 'ok')}
      />
    </section>
  );
}

function RaiseModal({
  open,
  onClose,
  onDone,
  onOk,
  onError,
}: {
  open: boolean;
  onClose: () => void;
  onDone: () => void;
  onOk: (m: string) => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('order');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSubject('');
      setMessage('');
      setCategory('order');
    }
  }, [open]);

  async function submit() {
    if (!subject.trim() || !message.trim()) return;
    setBusy(true);
    try {
      await api.createSupportTicket({ subject: subject.trim(), message: message.trim(), category });
      onOk(t('support.sent', 'Message sent — we’ll get back to you.'));
      onDone();
    } catch (e) {
      onError(
        e instanceof Error ? e.message : t('support.failed', 'Could not send. Please try again.'),
      );
    } finally {
      setBusy(false);
    }
  }

  const input = { width: '100%', padding: '8px 10px' } as const;
  const cats: { value: string; key: string; fallback: string }[] = [
    { value: 'order', key: 'support.cat.order', fallback: 'An order' },
    { value: 'payment', key: 'support.cat.payment', fallback: 'Payment' },
    { value: 'account', key: 'support.cat.account', fallback: 'My account' },
    { value: 'other', key: 'support.cat.other', fallback: 'Something else' },
  ];

  return (
    <Modal
      open={open}
      title={t('support.raiseTitle', 'Contact support')}
      subtitle={t('support.raiseSub', 'Tell us what’s wrong and we’ll help.')}
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={busy || !subject.trim() || !message.trim()}
            onClick={() => void submit()}
          >
            {busy ? '…' : t('support.send', 'Send')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('support.about', 'About')}</span>
          <select
            style={input}
            aria-label={t('support.about', 'About')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {cats.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.key, c.fallback)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('support.subject', 'Subject')} *</span>
          <input
            style={input}
            aria-label={t('support.subject', 'Subject')}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={160}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('support.message', 'Message')} *</span>
          <textarea
            style={{ ...input, minHeight: 90, resize: 'vertical' }}
            aria-label={t('support.message', 'Message')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={2000}
          />
        </label>
      </div>
    </Modal>
  );
}
