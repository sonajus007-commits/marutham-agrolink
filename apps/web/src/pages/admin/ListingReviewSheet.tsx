import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Modal, Sheet } from '@marutham/ui';
import { api, type AdminListing } from '@marutham/api-client';
import {
  fmtDate, fmtMoney, subscriptionStatus,
  listingActions, listingActionStatus, listingWaitDays, isListingStale,
  type ListingAction,
} from '@marutham/lib';
import { useToast } from '../../components/Toast';

export const LISTING_STATUS_TONE: Record<string, string> = {
  pending: 'var(--warning-strong)',
  active: 'var(--success)',
  rejected: 'var(--danger)',
};

/** Seller subscription health → the design system's status vocabulary. Reused from
 *  the shared subscriptionStatus() rather than re-derived: legacy computed the
 *  "expired / N days left" colour inline, in the table cell, with its own maths. */
const SUB_TONE: Record<string, string> = {
  active: 'var(--success)',
  expiring: 'var(--warning-strong)',
  expired: 'var(--danger)',
  none: 'var(--fg-muted)',
};

export function ListingReviewSheet({
  listing,
  open,
  onClose,
  onChanged,
}: {
  listing: AdminListing | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<ListingAction | null>(null);

  if (!listing) {
    return <Sheet open={open} title={t('admin.lst.title')} onClose={onClose}><div /></Sheet>;
  }

  const status = String(listing.listing_status || 'pending');
  const p = listing.product;
  const f = listing.farmer;
  const sub = subscriptionStatus({
    subscription_plan: f?.subscription_plan,
    subscription_expires_at: f?.subscription_expires_at,
  });
  const waited = listingWaitDays(listing.created_at);
  const stale = isListingStale(listing.created_at, status);
  const actions = listingActions(status);
  const sellerName = `${f?.fname || ''} ${f?.lname || ''}`.trim() || '—';

  async function act(action: ListingAction) {
    setBusy(true);
    try {
      const res = await api.setListingStatus(listing!.id, listingActionStatus(action));
      toast(res.message || t('admin.lst.done'), 'ok');
      onChanged();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Action failed', 'er');
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  return (
    <Sheet open={open} title={p?.name || t('admin.lst.title')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-pill px-3 py-1 text-xs font-bold text-white"
            style={{ background: LISTING_STATUS_TONE[status] || 'var(--fg-muted)' }}
          >
            {t('admin.lst.status.' + status, status)}
          </span>
          {/* How long the seller has been waiting. They cannot price — and so
              cannot earn from — a product that is still pending, which is the whole
              reason this queue must not be allowed to age quietly. */}
          {waited !== null && status === 'pending' ? (
            <span className={`text-2xs font-bold ${stale ? 'text-danger' : 'text-fg-muted'}`}>
              {stale ? '⚠ ' : ''}
              {t('admin.lst.waiting', { count: waited })}
            </span>
          ) : null}
        </div>

        {/* The produce photos. This is the evidence the decision rests on — an
            approval is a judgement about real produce, not about a row. */}
        {listing.images?.length ? (
          <div className="flex gap-2 overflow-x-auto">
            {listing.images.map((src, i) => (
              <img
                key={src}
                src={src}
                alt={t('admin.lst.photoAlt', { n: i + 1, product: p?.name || '' })}
                className="h-28 w-28 shrink-0 rounded-base border border-border-subtle object-cover"
              />
            ))}
          </div>
        ) : (
          <p className="rounded-base border border-dashed border-border-subtle bg-surface-muted px-3 py-2 text-2xs text-fg-muted">
            {t('admin.lst.noPhotos')}
          </p>
        )}

        <Section title={`🌾 ${t('admin.lst.product')}`}>
          <Row label={t('admin.lst.name')} value={p?.name || '—'} strong />
          {p?.code ? <Row label={t('admin.lst.code')} value={p.code} mono /> : null}
          <Row
            label={t('admin.lst.price')}
            // farmer_price is a MONEY_FIELDS key — it arrives as rupees already.
            value={`${fmtMoney(listing.farmer_price)} / ${p?.unit || t('admin.lst.unit')}`}
            strong
          />
          <Row
            label={t('admin.lst.qty')}
            value={listing.qty_available != null ? String(listing.qty_available) : '—'}
          />
          <Row label={t('admin.lst.submitted')} value={fmtDate(listing.created_at)} />
        </Section>

        <Section title={`🧑‍🌾 ${t('admin.lst.seller')}`}>
          <Row label={t('admin.lst.sellerName')} value={sellerName} strong />
          {f?.login_id ? <Row label={t('admin.lst.loginId')} value={f.login_id} mono /> : null}
          {f?.seller_type ? <Row label={t('admin.lst.sellerType')} value={f.seller_type} /> : null}
          {f?.district ? <Row label={t('admin.lst.district')} value={f.district} /> : null}

          {/* Subscription health, and it is not decoration: a seller whose plan has
              lapsed is not entitled to sell, so approving their produce onto the
              storefront is a decision the reviewer should make knowingly. */}
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-2xs uppercase tracking-wide text-fg-muted">
              {t('admin.lst.subscription')}
            </span>
            <span className="flex items-center gap-2 text-sm font-semibold text-fg">
              {sub.plan ? <span>{sub.plan}</span> : <span className="text-fg-muted">—</span>}
              <span
                className="rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
                style={{ background: SUB_TONE[sub.level] }}
              >
                {t('admin.lst.sub.' + sub.level)}
                {sub.daysLeft !== null && sub.level === 'expiring'
                  ? ` · ${t('admin.lst.daysLeft', { count: sub.daysLeft })}`
                  : ''}
              </span>
            </span>
          </div>
          {sub.expiresAt ? <Row label={t('admin.lst.expiresOn')} value={fmtDate(sub.expiresAt)} /> : null}
        </Section>

        {sub.level === 'expired' ? (
          <p role="alert" className="rounded-base border border-danger bg-danger-bg px-3 py-2 text-2xs text-danger-fg">
            {t('admin.lst.expiredWarning')}
          </p>
        ) : null}

        <section className="flex flex-col gap-2 rounded-base border border-border-subtle bg-surface-muted p-3">
          <p className="text-2xs text-fg-muted">{t('admin.lst.hint.' + status, { defaultValue: '' })}</p>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a}
                variant={a === 'approve' ? 'primary' : a === 'reject' ? 'danger' : 'ghost'}
                onClick={() => setConfirming(a)}
                disabled={busy}
              >
                {t('admin.lst.action.' + a)}
              </Button>
            ))}
          </div>
        </section>
      </div>

      {/* Every action is confirmed, because none of them is cheap: approving EMAILS
          the seller (notifyProductApproved) and puts produce in front of customers;
          rejecting and deactivating take it away again. */}
      <Modal
        open={confirming !== null}
        title={confirming ? t('admin.lst.action.' + confirming) : ''}
        subtitle={p?.name || ''}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={busy}>
              {t('admin.lst.cancel')}
            </Button>
            <Button
              variant={confirming === 'reject' ? 'danger' : 'primary'}
              onClick={() => confirming && act(confirming)}
              disabled={busy}
            >
              {busy ? '…' : confirming ? t('admin.lst.action.' + confirming) : ''}
            </Button>
          </>
        }
      >
        <p className="text-sm text-fg">
          {confirming ? t('admin.lst.confirm.' + confirming, { seller: sellerName, product: p?.name || '' }) : ''}
        </p>
      </Modal>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-base border border-border-subtle bg-surface p-4">
      <h3 className="mb-2 text-sm font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, value, mono = false, strong = false }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span className={`text-sm ${strong ? 'font-bold' : 'font-semibold'} text-fg ${mono ? 'tabular-nums' : ''}`}>{value}</span>
    </div>
  );
}
