/* Audit-trail domain — shared by the user and the employee change logs.
 *
 * Both DB triggers (013_audit_login.sql, 021_employee_org.sql) write the SAME
 * shape: `changed_fields` is a JSONB **object** — `{ field: { old, new } }` —
 * never an array of names. INSERT and DELETE rows carry no changed_fields at
 * all; they carry a `row_snapshot` instead.
 *
 * That shape is why this module exists. EmployeeDetailSheet used to type the
 * column as `string[]` and render it behind a `.length` guard, which an object
 * never satisfies — so every employee change silently displayed as a bare
 * "UPDATE" with no diff. One normalizer, used by both sheets, is the fix.
 *
 * The audit log is Head Office / State Head only (backend isHeadOffice), but
 * "only HO can see it" is not a reason to print a full Aadhaar or bank account
 * into a scrolling list — the rest of the console masks them, so this does too.
 * A masked value still shows the auditor THAT the number changed. */

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE' | (string & {});

export interface AuditFieldChange {
  old: unknown;
  new: unknown;
}

/** `{ approval_status: { old: 'pending_review', new: 'rejected' } }` */
export type AuditChangedFields = Record<string, AuditFieldChange>;

export interface AuditEntry {
  id: string | number;
  action: AuditAction;
  changed_fields?: AuditChangedFields | null;
  row_snapshot?: Record<string, unknown> | null;
  changed_at: string;
  changed_by?: string | null;
}

/** One field's before/after, already labelled and stringified for display. */
export interface AuditChange {
  field: string;
  label: string;
  old: string;
  new: string;
}

/** Never rendered in full, even to Head Office. */
const SECRET_FIELDS = new Set(['aadhar', 'aadhaar', 'bank_account', 'password_hash']);

/** Noise the trigger records but no auditor reads. */
const HIDDEN_FIELDS = new Set(['updated_at', 'password_hash']);

export function maskSecret(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (!s) return '—';
  return s.length > 4 ? '••••' + s.slice(-4) : '••••';
}

/** Human label for a column name: `approval_status` → `Approval status`. */
export function auditFieldLabel(field: string): string {
  const spaced = field.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** One value, as it should read in the log. Ports the legacy auditVal(). */
export function formatAuditValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (SECRET_FIELDS.has(field)) return maskSecret(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/**
 * Flatten a trigger's changed_fields object into a sorted, display-ready list.
 * Returns [] for INSERT/DELETE rows (which have no diff) and for the empty or
 * malformed values Postgres can hand back.
 */
export function auditChanges(entry: Pick<AuditEntry, 'changed_fields'>): AuditChange[] {
  const cf = entry.changed_fields;
  // Guard the shape rather than trusting it: an array here was the old bug.
  if (!cf || typeof cf !== 'object' || Array.isArray(cf)) return [];

  return Object.keys(cf)
    .filter((f) => !HIDDEN_FIELDS.has(f))
    .sort()
    .map((field) => {
      const change = cf[field] || ({} as AuditFieldChange);
      return {
        field,
        label: auditFieldLabel(field),
        old: formatAuditValue(field, change.old),
        new: formatAuditValue(field, change.new),
      };
    });
}

export function auditActionLabel(action: AuditAction): string {
  if (action === 'INSERT') return 'Record created';
  if (action === 'DELETE') return 'Record deleted';
  if (action === 'UPDATE') return 'Updated';
  return String(action);
}

/* ── Login history ────────────────────────────────────────────────────────── */

export type LoginTone = 'success' | 'danger' | 'warning' | 'neutral';

export interface LoginOutcomeMeta {
  label: string;
  tone: LoginTone;
}

/* Ports the legacy OUT map. `approved` is not a success — it means the seller
 * cleared review but still owes the subscription payment, so the login was
 * refused. Tones are semantic, not hex, so dark mode follows the tokens. */
const OUTCOMES: Record<string, LoginOutcomeMeta> = {
  success: { label: 'Success', tone: 'success' },
  invalid_credentials: { label: 'Invalid credentials', tone: 'danger' },
  otp_invalid: { label: 'Wrong OTP', tone: 'danger' },
  blocked: { label: 'Blocked', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'danger' },
  pending_review: { label: 'Pending review', tone: 'warning' },
  approved: { label: 'Awaiting payment', tone: 'warning' },
};

export function loginOutcome(outcome?: string | null): LoginOutcomeMeta {
  if (!outcome) return { label: '—', tone: 'neutral' };
  return OUTCOMES[outcome] || { label: auditFieldLabel(outcome), tone: 'neutral' };
}

/** The browser/app, short enough for a list row. */
export function shortUserAgent(ua?: string | null, max = 60): string {
  const s = (ua || '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) + '…' : s;
}
