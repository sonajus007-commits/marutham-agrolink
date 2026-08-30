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
import { api, type ProductRequest, type ProductRequestStatus } from '@marutham/api-client';
import { fmtDateShort } from '@marutham/lib';
import { useToast } from '../../components/Toast';

/* The reviewer's queue for seller product requests (migration 054). Approving one
 * creates the catalogue product (the admin assigns its code); rejecting records a
 * reason. Both notify the seller through the in-app bell. */

const STATUS_TONE: Record<ProductRequestStatus, string> = {
  pending: 'var(--sun)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
};

export function ProductRequestsPage() {
  const { t, i18n } = useTranslation();
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('pending');
  const [approving, setApproving] = useState<ProductRequest | null>(null);
  const [rejecting, setRejecting] = useState<ProductRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProductRequests(); // reviewer → all; filter client-side
      setRequests(res.requests || []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('admin.preq.loadFailed', 'Could not load requests'),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const options = useMemo(() => {
    const c: Record<string, number> = {};
    requests.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return [
      { value: 'pending', label: `${t('admin.preq.pending', 'Pending')} (${c.pending || 0})` },
      { value: 'approved', label: `${t('admin.preq.approved', 'Approved')} (${c.approved || 0})` },
      { value: 'rejected', label: `${t('admin.preq.rejected', 'Rejected')} (${c.rejected || 0})` },
    ];
  }, [requests, t]);

  const shown = requests.filter((r) => r.status === status);

  if (loading && requests.length === 0) return <Spinner />;
  if (error) return <EmptyState icon="⚠️">{error}</EmptyState>;

  return (
    <>
      <h1 className="mb-1 text-xl font-bold text-primary">
        🧺 {t('admin.preq.title', 'Product Requests')}
      </h1>
      <p className="mb-4 text-2xs text-fg-muted">
        {t('admin.preq.sub', 'Sellers proposing products that are not in the catalogue yet.')}
      </p>

      <div className="mb-4">
        <FilterChips options={options} value={status} onChange={setStatus} />
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="🧺">{t('admin.preq.empty', 'Nothing here.')}</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-fg">
                    {r.name}
                    {r.regional_name ? ` — ${r.regional_name}` : ''}
                  </div>
                  <div className="mt-0.5 text-2xs text-fg-muted">
                    {t('admin.preq.unit', 'Unit')}: {r.unit}
                    {r.category ? ` · ${r.category}` : ''} ·{' '}
                    {fmtDateShort(r.created_at, i18n.language)}
                  </div>
                  {r.note ? <p className="mt-1 text-xs text-fg-muted">{r.note}</p> : null}
                  {r.status === 'rejected' && r.review_reason ? (
                    <p className="mt-1 text-xs" style={{ color: 'var(--red)' }}>
                      {t('admin.preq.reason', 'Reason')}: {r.review_reason}
                    </p>
                  ) : null}
                </div>
                <span
                  className="shrink-0 text-2xs font-bold uppercase"
                  style={{ color: STATUS_TONE[r.status] }}
                >
                  {t('admin.preq.' + r.status, r.status)}
                </span>
              </div>

              {r.status === 'pending' ? (
                <div className="mt-3 flex gap-2">
                  <Button onClick={() => setApproving(r)}>
                    {t('admin.preq.approve', 'Approve')}
                  </Button>
                  <Button variant="danger" onClick={() => setRejecting(r)}>
                    {t('admin.preq.reject', 'Reject')}
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <ApproveModal
        request={approving}
        onClose={() => setApproving(null)}
        onDone={() => {
          setApproving(null);
          void load();
        }}
      />
      <RejectModal
        request={rejecting}
        onClose={() => setRejecting(null)}
        onDone={() => {
          setRejecting(null);
          void load();
        }}
      />
    </>
  );
}

function ApproveModal({
  request,
  onClose,
  onDone,
}: {
  request: ProductRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [category, setCategory] = useState('');
  const [group, setGroup] = useState('');
  const [fee, setFee] = useState('5');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (request) {
      setCode('');
      setCategory(request.category || '');
      setGroup('');
      setFee('5');
    }
  }, [request]);

  async function submit() {
    if (!request || !code.trim()) return;
    setBusy(true);
    try {
      await api.approveProductRequest(request.id, {
        code: code.trim(),
        category: category.trim() || undefined,
        product_group: group.trim() || undefined,
        platform_fee_pct: Number(fee) || 5,
      });
      toast(t('admin.preq.approved', 'Approved') + ' — ' + request.name, 'ok');
      onDone();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.preq.actionFailed', 'That did not work'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  const input = { width: '100%', padding: '8px 10px' } as const;
  return (
    <Modal
      open={request !== null}
      title={t('admin.preq.approveTitle', 'Add to catalogue')}
      subtitle={request ? `${request.name} (${request.unit})` : undefined}
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button disabled={busy || !code.trim()} onClick={() => void submit()}>
            {busy ? '…' : t('admin.preq.approve', 'Approve')}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('admin.preq.code', 'Catalogue code')} *</span>
          <input
            style={input}
            aria-label={t('admin.preq.code', 'Catalogue code')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. g01"
            maxLength={40}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('admin.preq.category', 'Category')}</span>
          <input
            style={input}
            aria-label={t('admin.preq.category', 'Category')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('admin.preq.group', 'Product group')}</span>
          <input
            style={input}
            aria-label={t('admin.preq.group', 'Product group')}
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            maxLength={80}
          />
        </label>
        <label>
          <span className={FIELD_LABEL_CLASS}>{t('admin.preq.fee', 'Platform fee %')}</span>
          <input
            style={input}
            type="number"
            aria-label={t('admin.preq.fee', 'Platform fee %')}
            min={0}
            max={100}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </label>
      </div>
    </Modal>
  );
}

function RejectModal({
  request,
  onClose,
  onDone,
}: {
  request: ProductRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (request) setReason('');
  }, [request]);

  async function submit() {
    if (!request || !reason.trim()) return;
    setBusy(true);
    try {
      await api.rejectProductRequest(request.id, reason.trim());
      toast(t('admin.preq.rejected', 'Rejected'), 'ok');
      onDone();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('admin.preq.actionFailed', 'That did not work'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={request !== null}
      title={t('admin.preq.rejectTitle', 'Reject this request?')}
      subtitle={request ? request.name : undefined}
      closeLabel={t('common.close', 'Close')}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => void submit()}>
            {busy ? '…' : t('admin.preq.reject', 'Reject')}
          </Button>
        </>
      }
    >
      <label>
        <span className={FIELD_LABEL_CLASS}>{t('admin.preq.reason', 'Reason')} *</span>
        <textarea
          style={{ width: '100%', padding: '8px 10px', minHeight: 70, resize: 'vertical' }}
          aria-label={t('admin.preq.reason', 'Reason')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
        />
      </label>
    </Modal>
  );
}
