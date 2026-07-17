import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Card, Field, Input, FIELD_ERR_CLASS } from '@marutham/ui';
import { api, SENSITIVE_FIELDS, type ProfileChangeRequest } from '@marutham/api-client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';

/* Sensitive seller fields, in display order. `key` is the column the server
 * expects; [i18n key, English] is only how it is labelled. */
const FIELDS: { key: (typeof SENSITIVE_FIELDS)[number]; label: [string, string] }[] = [
  { key: 'business_name', label: ['farmer.bank.businessName', 'Business / Farm Name'] },
  { key: 'business_type', label: ['farmer.bank.businessType', 'Business Type'] },
  { key: 'gst_number', label: ['farmer.bank.gst', 'GST Number'] },
  { key: 'bank_name', label: ['farmer.bank.bankName', 'Bank Name'] },
  { key: 'bank_account', label: ['farmer.bank.account', 'Account Number'] },
  { key: 'ifsc', label: ['farmer.bank.ifsc', 'IFSC Code'] },
];

type Draft = Record<string, string>;

function draftFrom(user: Record<string, unknown>): Draft {
  const d: Draft = {};
  for (const { key } of FIELDS) d[key] = (user[key] as string) || '';
  return d;
}

/**
 * Bank / business details. These are payout-critical, so they are NEVER written
 * directly: the seller submits new values as a change request that Head Office
 * reviews in the admin portal (POST /auth/profile-change-request → email → approve).
 * A pending request blocks a second one (the server 409s), so we surface that
 * state and hide the form until it is resolved. See [[project-profile-change-requests]].
 */
export function BankDetailsCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(user || {}));
  const [pending, setPending] = useState<ProfileChangeRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // A pending request is authoritative over the local form.
  useEffect(() => {
    let active = true;
    api
      .getMyChangeRequest()
      .then((res) => {
        if (!active) return;
        setPending((res.requests || []).find((r) => r.status === 'pending') || null);
      })
      .catch(() => {
        /* non-fatal: the section still renders read-only values */
      });
    return () => {
      active = false;
    };
  }, []);

  const current = useMemo(() => draftFrom(user || {}), [user]);
  if (!user) return null;
  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  function openEdit() {
    setDraft(draftFrom(user || {}));
    setError(null);
    setEditing(true);
  }

  async function submit() {
    // Send only what actually changed and is non-empty — the server keeps just
    // the SENSITIVE_FIELDS and rejects an empty payload.
    const changes: Draft = {};
    for (const { key } of FIELDS) {
      if (draft[key] && draft[key] !== current[key]) changes[key] = draft[key];
    }
    if (Object.keys(changes).length === 0) {
      setError(t('farmer.bank.noChange', 'Change at least one value to request an update.'));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await api.profileChangeRequest(changes);
      setPending(res.request);
      setEditing(false);
      toast(t('farmer.bank.sent', 'Change request sent to the admin team for approval.'), 'ok');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : t('farmer.bank.failed', 'Could not submit change request'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-md font-bold text-primary">
        🏦 {t('farmer.bank.title', 'Bank & Business Details')}
      </h3>
      <p className="mb-3 text-2xs text-fg-muted">
        {t(
          'farmer.bank.blurb',
          'These affect your payouts, so changes are reviewed and approved by the admin team.',
        )}
      </p>

      {pending ? (
        <div className="rounded-sm border border-warning-bg bg-warning-bg p-3">
          <div className="text-sm font-bold text-warning-fg">
            ⏳ {t('farmer.bank.pending', 'Change request pending approval')}
          </div>
          <p className="mt-1 text-2xs text-warning-fg">
            {t(
              'farmer.bank.pendingBlurb',
              'The admin team has been notified by email and will review your request shortly.',
            )}
          </p>
          <dl className="mt-2 flex flex-col gap-1">
            {Object.entries(pending.requested_changes || {}).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 text-2xs">
                <dt className="text-fg-muted">
                  {(() => {
                    const f = FIELDS.find((x) => x.key === k);
                    return f ? t(f.label[0], f.label[1]) : k;
                  })()}
                </dt>
                <dd className="font-semibold text-fg">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : !editing ? (
        <>
          <dl className="flex flex-col">
            {FIELDS.map(({ key, label }) => (
              <div
                key={key}
                className="flex justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0"
              >
                <dt className="text-2xs uppercase tracking-wide text-fg-muted">
                  {t(label[0], label[1])}
                </dt>
                <dd className="text-sm font-semibold text-fg">{current[key] || '—'}</dd>
              </div>
            ))}
          </dl>
          <Button variant="ghost" className="mt-3" onClick={openEdit}>
            ✏️ {t('farmer.bank.requestChange', 'Request Change')}
          </Button>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {FIELDS.map(({ key, label }) => (
            <Field key={key} label={t(label[0], label[1])}>
              {(p) => (
                <Input
                  {...p}
                  type="text"
                  value={draft[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              )}
            </Field>
          ))}

          {error ? (
            <div className={FIELD_ERR_CLASS} role="alert">
              {error}
            </div>
          ) : null}

          <div className="flex gap-2">
            <Button onClick={submit} disabled={busy}>
              {busy
                ? t('consumer.return.busy', 'Submitting…')
                : t('farmer.bank.submit', 'Submit for Approval')}
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
