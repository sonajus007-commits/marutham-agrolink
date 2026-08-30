import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, FIELD_LABEL_CLASS } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useToast } from '../../components/Toast';

/* CSV report export (A3). Downloads are fetched with the auth token (apiFetchBlob)
 * and handed to the browser as a file — a plain <a href> can't carry the Bearer
 * token, so we build an object URL from the Blob and click it. Gated in the nav on
 * reports_export:view; the endpoints re-check server-side. */

type ReportType = 'orders' | 'payouts' | 'users';

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [district, setDistrict] = useState('');
  const [busy, setBusy] = useState<ReportType | null>(null);

  async function download(type: ReportType) {
    setBusy(type);
    try {
      const blob = await api.downloadReport(type, {
        from: from || undefined,
        to: to || undefined,
        district: district.trim() || undefined,
      });
      const stamp = new Date().toISOString().slice(0, 10);
      saveBlob(blob, `${type}-${stamp}.csv`);
      toast(t('admin.reports.done', 'Report downloaded.'), 'ok');
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.reports.failed', 'Could not build the report.'),
        'er',
      );
    } finally {
      setBusy(null);
    }
  }

  const input = { width: '100%', padding: '9px 11px' } as const;
  const reports: { type: ReportType; key: string; fallback: string; desc: string }[] = [
    {
      type: 'orders',
      key: 'admin.reports.orders',
      fallback: 'Orders',
      desc: t('admin.reports.ordersDesc', 'Every customer order with totals and status.'),
    },
    {
      type: 'payouts',
      key: 'admin.reports.payouts',
      fallback: 'Seller payouts',
      desc: t('admin.reports.payoutsDesc', 'Settlement records by seller.'),
    },
    {
      type: 'users',
      key: 'admin.reports.users',
      fallback: 'Users',
      desc: t('admin.reports.usersDesc', 'Customers and sellers with role and district.'),
    },
  ];

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">
        📊 {t('admin.reports.title', 'Reports')}
      </h1>
      <p className="mb-4 text-2xs text-fg-muted">
        {t('admin.reports.sub', 'Export data as CSV for finance and operations.')}
      </p>

      <Card>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 4, maxWidth: 640 }}>
          <label style={{ flex: '1 1 140px' }}>
            <span className={FIELD_LABEL_CLASS}>{t('admin.reports.from', 'From')}</span>
            <input
              style={input}
              type="date"
              aria-label={t('admin.reports.from', 'From')}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label style={{ flex: '1 1 140px' }}>
            <span className={FIELD_LABEL_CLASS}>{t('admin.reports.to', 'To')}</span>
            <input
              style={input}
              type="date"
              aria-label={t('admin.reports.to', 'To')}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label style={{ flex: '1 1 160px' }}>
            <span className={FIELD_LABEL_CLASS}>
              {t('admin.reports.district', 'District (optional)')}
            </span>
            <input
              style={input}
              aria-label={t('admin.reports.district', 'District')}
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              maxLength={80}
            />
          </label>
        </div>
      </Card>

      <div className="mt-3 flex flex-col gap-3">
        {reports.map((r) => (
          <Card key={r.type}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-fg">{t(r.key, r.fallback)}</div>
                <div className="text-2xs text-fg-muted">{r.desc}</div>
              </div>
              <Button disabled={busy !== null} onClick={() => void download(r.type)}>
                {busy === r.type ? '…' : `⬇ ${t('admin.reports.download', 'Download CSV')}`}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
