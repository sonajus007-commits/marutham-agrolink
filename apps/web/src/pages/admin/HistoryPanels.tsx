import { useTranslation } from 'react-i18next';
import { Spinner } from '@marutham/ui';
import type { AuditEntry, LoginTone } from '@marutham/lib';
import {
  auditActionLabel,
  auditChanges,
  fmtDate,
  loginOutcome,
  shortUserAgent,
} from '@marutham/lib';
import type { LoginHistoryEntry } from '@marutham/api-client';

/* The record-change trail and the login trail, rendered once and used by both
 * the user sheet and the employee sheet — the two DB triggers write the same
 * shape, so there is no reason for two renderers (there used to be, and the
 * employee one silently dropped every diff).
 *
 * Both are Head Office / State Head only; the caller gates on that and never
 * mounts these for a scoped admin. */

const TONE_COLOR: Record<LoginTone, string> = {
  success: 'var(--success)',
  danger: 'var(--danger)',
  warning: 'var(--warning-strong)',
  neutral: 'var(--fg-muted)',
};

export interface HistoryPanelProps<T> {
  rows: T[];
  loading: boolean;
  error?: string | null;
  emptyText: string;
}

function PanelState({
  loading,
  error,
  empty,
  emptyText,
}: {
  loading: boolean;
  error?: string | null;
  empty: boolean;
  emptyText: string;
}) {
  if (loading) return <Spinner />;
  if (error) return <p className="py-2 text-2xs text-danger">{error}</p>;
  if (empty) return <p className="py-2 text-2xs text-fg-muted">{emptyText}</p>;
  return null;
}

/** Record changes from the audit trigger: what changed, from what, to what. */
export function AuditLogList({ rows, loading, error, emptyText }: HistoryPanelProps<AuditEntry>) {
  if (loading || error || rows.length === 0) {
    return (
      <PanelState loading={loading} error={error} empty={rows.length === 0} emptyText={emptyText} />
    );
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {rows.map((entry) => {
        const changes = auditChanges(entry);
        return (
          <li key={entry.id} className="rounded-base bg-surface-muted p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xs font-bold text-primary">
                {auditActionLabel(entry.action)}
              </span>
              <span className="text-2xs text-fg-muted">{fmtDate(entry.changed_at)}</span>
            </div>
            {changes.map((c) => (
              <div key={c.field} className="mt-1 text-2xs">
                <span className="font-semibold text-fg">{c.label}: </span>
                <span className="text-fg-muted line-through">{c.old}</span>
                <span className="text-fg-muted"> → </span>
                <span className="font-semibold text-success">{c.new}</span>
              </div>
            ))}
          </li>
        );
      })}
    </ul>
  );
}

/** Every login attempt — the failures are the point, so they are not filtered. */
export function LoginHistoryList({
  rows,
  loading,
  error,
  emptyText,
}: HistoryPanelProps<LoginHistoryEntry>) {
  const { t } = useTranslation();
  if (loading || error || rows.length === 0) {
    return (
      <PanelState loading={loading} error={error} empty={rows.length === 0} emptyText={emptyText} />
    );
  }

  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {rows.map((l) => {
        const outcome = loginOutcome(l.outcome);
        const ua = shortUserAgent(l.user_agent);
        return (
          <li key={l.id} className="rounded-base bg-surface-muted p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-pill px-2 py-0.5 text-2xs font-bold text-white"
                style={{ background: TONE_COLOR[outcome.tone] }}
              >
                {outcome.label}
              </span>
              {l.method ? (
                <span className="text-2xs uppercase tracking-wide text-fg-muted">{l.method}</span>
              ) : null}
              <span className="ml-auto text-2xs text-fg-muted">{fmtDate(l.created_at)}</span>
            </div>
            <div className="mt-1 text-2xs text-fg-muted">
              {t('admin.users.ip')}: {l.ip_address || '—'}
              {ua ? ` · ${ua}` : ''}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
