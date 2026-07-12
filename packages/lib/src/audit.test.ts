import { describe, it, expect } from 'vitest';
import {
  auditChanges, auditActionLabel, auditFieldLabel, formatAuditValue,
  maskSecret, loginOutcome, shortUserAgent,
} from './audit';

describe('auditChanges — the trigger writes an object, not an array', () => {
  it('flattens { field: { old, new } } into a sorted list', () => {
    // Verbatim shape from the live DB (021 trigger, employee approval).
    const changes = auditChanges({
      changed_fields: {
        emp_id: { old: null, new: 'MATN00006' },
        approval_status: { old: 'pending', new: 'approved' },
      },
    });
    expect(changes.map((c) => c.field)).toEqual(['approval_status', 'emp_id']); // sorted
    expect(changes[0]).toEqual({
      field: 'approval_status', label: 'Approval status', old: 'pending', new: 'approved',
    });
    expect(changes[1].old).toBe('—'); // null reads as an em dash, not "null"
    expect(changes[1].new).toBe('MATN00006');
  });

  it('returns [] for INSERT/DELETE rows, which carry a snapshot and no diff', () => {
    expect(auditChanges({ changed_fields: null })).toEqual([]);
    expect(auditChanges({ changed_fields: undefined })).toEqual([]);
    expect(auditChanges({ changed_fields: {} })).toEqual([]);
  });

  it('survives an array — the exact shape the old employee sheet assumed', () => {
    // Typed as string[] before; a `.length` guard on the real object silently
    // rendered nothing. Neither shape may throw now.
    expect(auditChanges({ changed_fields: ['status'] as never })).toEqual([]);
  });

  it('drops updated_at noise the trigger cannot avoid recording', () => {
    const changes = auditChanges({
      changed_fields: {
        updated_at: { old: 'a', new: 'b' },
        status: { old: 'active', new: 'blocked' },
      },
    });
    expect(changes.map((c) => c.field)).toEqual(['status']);
  });

  it('masks Aadhaar and bank accounts, but still shows that they changed', () => {
    const changes = auditChanges({
      changed_fields: {
        aadhar: { old: '123456789012', new: '999988887777' },
        bank_account: { old: '30123456789', new: '30987654321' },
      },
    });
    expect(changes[0]).toMatchObject({ field: 'aadhar', old: '••••9012', new: '••••7777' });
    expect(changes[1]).toMatchObject({ old: '••••6789', new: '••••4321' });
    // The full number never reaches the DOM.
    expect(JSON.stringify(changes)).not.toContain('123456789012');
  });

  it('renders objects and booleans rather than [object Object]', () => {
    const changes = auditChanges({
      changed_fields: {
        is_hr_admin: { old: false, new: true },
        service_villages: { old: [], new: ['Keeranur'] },
      },
    });
    expect(changes[0].new).toBe('true');
    expect(changes[1].new).toBe('["Keeranur"]');
  });
});

describe('formatAuditValue / maskSecret / auditFieldLabel', () => {
  it('reads empty values as an em dash', () => {
    expect(formatAuditValue('fname', null)).toBe('—');
    expect(formatAuditValue('fname', '')).toBe('—');
  });

  it('masks a short secret without leaking its length', () => {
    expect(maskSecret('123')).toBe('••••');
    expect(maskSecret('')).toBe('—');
  });

  it('humanises column names', () => {
    expect(auditFieldLabel('approval_status')).toBe('Approval status');
    expect(auditFieldLabel('subscription_expires_at')).toBe('Subscription expires at');
  });
});

describe('auditActionLabel', () => {
  it('names the three trigger actions and passes anything else through', () => {
    expect(auditActionLabel('INSERT')).toBe('Record created');
    expect(auditActionLabel('UPDATE')).toBe('Updated');
    expect(auditActionLabel('DELETE')).toBe('Record deleted');
    expect(auditActionLabel('TRUNCATE')).toBe('TRUNCATE');
  });
});

describe('loginOutcome', () => {
  it('tones a successful login green and a bad credential red', () => {
    expect(loginOutcome('success')).toEqual({ label: 'Success', tone: 'success' });
    expect(loginOutcome('invalid_credentials').tone).toBe('danger');
    expect(loginOutcome('otp_invalid').tone).toBe('danger');
    expect(loginOutcome('blocked').tone).toBe('danger');
  });

  it('treats "approved" as a REFUSED login — the seller still owes payment', () => {
    expect(loginOutcome('approved')).toEqual({ label: 'Awaiting payment', tone: 'warning' });
    expect(loginOutcome('pending_review').tone).toBe('warning');
  });

  it('falls back readably for an outcome the server adds later', () => {
    expect(loginOutcome('rate_limited')).toEqual({ label: 'Rate limited', tone: 'neutral' });
    expect(loginOutcome(null)).toEqual({ label: '—', tone: 'neutral' });
  });
});

describe('shortUserAgent', () => {
  it('truncates a long UA and leaves a short one alone', () => {
    expect(shortUserAgent('Mozilla/5.0', 60)).toBe('Mozilla/5.0');
    expect(shortUserAgent('x'.repeat(80), 60)).toHaveLength(61); // 60 + ellipsis
    expect(shortUserAgent(null)).toBe('');
  });
});
