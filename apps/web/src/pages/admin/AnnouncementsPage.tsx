import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useToast } from '../../components/Toast';

/* Broadcast composer (A2): send one in-app notice to a segment through the same
 * notification bell everything else uses. Gated in the nav on notifications:create;
 * the POST is re-checked server-side. Push/SMS ride the same event once those
 * credentials land. */

type Audience = 'consumers' | 'sellers' | 'all';

export function AnnouncementsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [audience, setAudience] = useState<Audience>('consumers');
  const [district, setDistrict] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState<string | null>(null);

  const canSend = title.trim().length > 0 && body.trim().length > 0;
  const input = { width: '100%', padding: '9px 11px' } as const;

  async function send() {
    if (!canSend) return;
    if (
      !window.confirm(
        t(
          'admin.ann.confirm',
          'Send this announcement now? Everyone in the audience will be notified.',
        ),
      )
    )
      return;
    setBusy(true);
    try {
      const res = await api.broadcastNotification({
        audience,
        district: district.trim() || undefined,
        title: title.trim(),
        body: body.trim(),
      });
      toast(res.message || t('admin.ann.sent', 'Announcement sent.'), 'ok');
      setLastSent(res.message || `${res.sent} sent`);
      setTitle('');
      setBody('');
    } catch (e) {
      toast(e instanceof Error ? e.message : t('admin.ann.failed', 'Could not send.'), 'er');
    } finally {
      setBusy(false);
    }
  }

  const audiences: { value: Audience; key: string; fallback: string }[] = [
    { value: 'consumers', key: 'admin.ann.aud.consumers', fallback: 'All customers' },
    {
      value: 'sellers',
      key: 'admin.ann.aud.sellers',
      fallback: 'All sellers (farmers & retailers)',
    },
    { value: 'all', key: 'admin.ann.aud.all', fallback: 'Everyone' },
  ];

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">
        📣 {t('admin.ann.title', 'Announcements')}
      </h1>
      <p className="mb-4 text-2xs text-fg-muted">
        {t('admin.ann.sub', 'Send an in-app notice to customers or sellers.')}
      </p>

      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 560 }}>
          <label>
            <span className={FIELD_LABEL_CLASS}>{t('admin.ann.audience', 'Audience')}</span>
            <select
              style={input}
              aria-label={t('admin.ann.audience', 'Audience')}
              value={audience}
              onChange={(e) => setAudience(e.target.value as Audience)}
            >
              {audiences.map((a) => (
                <option key={a.value} value={a.value}>
                  {t(a.key, a.fallback)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={FIELD_LABEL_CLASS}>
              {t('admin.ann.district', 'District (optional — leave blank for all)')}
            </span>
            <input
              style={input}
              aria-label={t('admin.ann.district', 'District')}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              maxLength={80}
            />
          </label>
          <label>
            <span className={FIELD_LABEL_CLASS}>{t('admin.ann.msgTitle', 'Title')} *</span>
            <input
              style={input}
              aria-label={t('admin.ann.msgTitle', 'Title')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
            />
          </label>
          <label>
            <span className={FIELD_LABEL_CLASS}>{t('admin.ann.message', 'Message')} *</span>
            <textarea
              style={{ ...input, minHeight: 100, resize: 'vertical' }}
              aria-label={t('admin.ann.message', 'Message')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={1000}
            />
          </label>
          <div>
            <Button disabled={busy || !canSend} onClick={() => void send()}>
              {busy ? '…' : `📣 ${t('admin.ann.send', 'Send announcement')}`}
            </Button>
          </div>
          {lastSent ? (
            <p className="text-2xs" style={{ color: 'var(--green)' }}>
              ✓ {lastSent}
            </p>
          ) : null}
        </div>
      </Card>
    </>
  );
}
