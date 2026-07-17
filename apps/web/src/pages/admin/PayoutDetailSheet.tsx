import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@marutham/ui';
import type { AdminPayout } from '@marutham/api-client';

type PayoutFarmer = NonNullable<AdminPayout['farmer']>;
import { fmtDate, fmtMoney } from '@marutham/lib';

export const PAYOUT_STATUS_TONE: Record<string, string> = {
  pending: 'var(--warning-strong)',
  paid: 'var(--success)',
};

/** Mask all but the last 4 of a bank account. */
function maskAccount(acc?: string | null): string {
  if (!acc) return '—';
  return acc.length > 4 ? '••••' + acc.slice(-4) : acc;
}

export function PayoutDetailSheet({
  payout,
  open,
  onClose,
}: {
  payout: AdminPayout | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  if (!payout)
    return (
      <Sheet open={open} title={t('admin.pay.title')} onClose={onClose}>
        <div />
      </Sheet>
    );

  const f: PayoutFarmer = payout.farmer ?? ({} as PayoutFarmer);
  const status = String(payout.status);
  const name = `${f.fname || ''} ${f.lname || ''}`.trim() || '—';

  return (
    <Sheet open={open} title={name} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="rounded-pill px-3 py-1 text-xs font-bold text-white"
            style={{ background: PAYOUT_STATUS_TONE[status] || 'var(--fg-muted)' }}
          >
            {t('admin.pay.status.' + status, status)}
          </span>
          <span className="text-lg font-bold text-primary">{fmtMoney(payout.amount)}</span>
        </div>

        <Section title={`👤 ${t('admin.pay.farmer')}`}>
          <Row label={t('admin.pay.name')} value={name} />
          {f.phone ? <Row label={t('admin.pay.phone')} value={String(f.phone)} mono /> : null}
        </Section>

        <Section title={`🏦 ${t('admin.pay.bank')}`}>
          {f.bank_name ? <Row label={t('admin.pay.bankName')} value={String(f.bank_name)} /> : null}
          <Row label={t('admin.pay.account')} value={maskAccount(f.bank_account)} mono />
          {f.ifsc ? <Row label={t('admin.pay.ifsc')} value={String(f.ifsc)} mono /> : null}
          {!f.bank_name && !f.bank_account ? (
            <p className="text-2xs text-fg-muted">{t('admin.pay.noBank')}</p>
          ) : null}
        </Section>

        <Section title={`💸 ${t('admin.pay.payout')}`}>
          <Row label={t('admin.pay.amount')} value={fmtMoney(payout.amount)} strong />
          {payout.order?.code ? (
            <Row label={t('admin.pay.order')} value={String(payout.order.code)} mono />
          ) : null}
          {payout.method ? (
            <Row label={t('admin.pay.method')} value={String(payout.method)} />
          ) : null}
          {payout.reference ? (
            <Row label={t('admin.pay.reference')} value={String(payout.reference)} mono />
          ) : null}
          {payout.created_at ? (
            <Row
              label={t('admin.pay.createdOn')}
              value={fmtDate(payout.created_at, i18n.language)}
            />
          ) : null}
          {payout.paid_at ? (
            <Row label={t('admin.pay.paidOn')} value={fmtDate(payout.paid_at, i18n.language)} />
          ) : null}
        </Section>
      </div>
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

function Row({
  label,
  value,
  mono = false,
  strong = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0">
      <span className="text-2xs uppercase tracking-wide text-fg-muted">{label}</span>
      <span
        className={`text-sm ${strong ? 'font-bold' : 'font-semibold'} text-fg ${mono ? 'tabular-nums' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}
