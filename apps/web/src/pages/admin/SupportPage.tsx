import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  EmptyState,
  FilterChips,
  Modal,
  Spinner,
  FIELD_LABEL_CLASS,
} from '@marutham/ui';
import { api, type SupportTicket, type SupportStatus } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { useToast } from '../../components/Toast';

/* Staff queue for support tickets (migration 055). Gated on customer_complaints:view
 * in the nav; the PATCH is re-checked server-side for :edit. Working a ticket — a
 * status change or a note — notifies the raiser through their bell. */

const STATUS_TONE: Record<SupportStatus, string> = {
  open: 'var(--sun)',
  in_progress: 'var(--sun)',
  resolved: 'var(--green)',
};

export function SupportPage() {
  const { t, i18n } = useTranslation();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [working, setWorking] = useState<SupportTicket | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getSupportTickets(); // staff → whole queue; filter client-side
      setTickets(res.tickets || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('admin.support.loadFailed', 'Could not load tickets'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const label = (s: SupportStatus) =>
    t(
      'support.status.' + s,
      s === 'in_progress' ? 'In progress' : s === 'resolved' ? 'Resolved' : 'Open',
    );

  const options = useMemo(() => {
    const c: Record<string, number> = {};
    tickets.forEach((tk) => (c[tk.status] = (c[tk.status] || 0) + 1));
    return (['open', 'in_progress', 'resolved'] as SupportStatus[]).map((s) => ({
      value: s,
      label: `${label(s)} (${c[s] || 0})`,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, t]);

  const shown = tickets.filter((tk) => tk.status === status);

  if (loading && tickets.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">
        🎧 {t('admin.support.title', 'Support')}
      </h1>
      <p className="mb-4 text-2xs text-fg-muted">
        {t('admin.support.sub', 'Customer and seller help requests.')}
      </p>

      <div className="mb-4">
        <FilterChips options={options} value={status} onChange={setStatus} />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="🎧">{t('admin.support.empty', 'Nothing here.')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((tk) => (
            <Card key={tk.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-fg">{tk.subject}</div>
                  <div className="mt-0.5 text-2xs text-fg-muted">
                    {tk.category ? `${tk.category} · ` : ''}
                    {fmtDateShort(tk.created_at, i18n.language)}
                  </div>
                  <p className="mt-1 text-xs text-fg-muted">{tk.message}</p>
                  {tk.admin_note ? (
                    <p className="mt-1 text-xs" style={{ color: 'var(--green)' }}>
                      {t('support.reply', 'Support')}: {tk.admin_note}
                    </p>
                  ) : null}
                </div>
                <span
                  className="shrink-0 text-2xs font-bold uppercase"
                  style={{ color: STATUS_TONE[tk.status] }}
                >
                  {label(tk.status)}
                </span>
              </div>
              {tk.status !== 'resolved' ? (
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => setWorking(tk)}>
                    {t('admin.support.work', 'Respond')}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <WorkModal
        ticket={working}
        onClose={() => setWorking(null)}
        onDone={() => {
          setWorking(null);
          void load();
        }}
      />
    </>
  );
}

function WorkModal({
  ticket,
  onClose,
  onDone,
}: {
  ticket: SupportTicket | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ticket) setNote('');
  }, [ticket]);

  async function act(status: SupportStatus) {
    if (!ticket) return;
    setBusy(true);
    try {
      await api.updateSupportTicket(ticket.id, {
        status,
        admin_note: note.trim() || undefined,
        assign_me: true,
      });
      toast(t('admin.support.updated', 'Ticket updated — the customer was notified.'), 'ok');
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.support.failed', 'That did not work'), 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={ticket !== null}
      title={t('admin.support.workTitle', 'Respond to request')}
      subtitle={ticket ? ticket.subject : undefined}
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void act('in_progress')}>
            {t('admin.support.inProgress', 'Mark in progress')}
          </Button>
          <Button disabled={busy} onClick={() => void act('resolved')}>
            {busy ? '…' : t('admin.support.resolve', 'Resolve')}
          </Button>
        </>
      }
    >
      {ticket ? (
        <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--muted)' }}>{ticket.message}</p>
      ) : null}
      <label>
        <span className={FIELD_LABEL_CLASS}>
          {t('admin.support.note', 'Reply to the customer')}
        </span>
        <textarea
          style={{ width: '100%', padding: '8px 10px', minHeight: 90, resize: 'vertical' }}
          aria-label={t('admin.support.note', 'Reply to the customer')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
        />
      </label>
    </Modal>
  );
}
