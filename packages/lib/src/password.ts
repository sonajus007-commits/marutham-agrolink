/* Password strength rules, ported from frontend/js/shared.js isStrongPw().
 *
 * The client is deliberately STRICTER than the server, which only enforces a
 * 6-character minimum (backend/routes/auth.js:411). These rules drive both the
 * live checklist and the submit guard, so they live here as data rather than as
 * a regex copy-pasted into each. */

export interface PasswordRule {
  id: string;
  label: string;
  test: (pw: string) => boolean;
}

const SPECIAL_RE = /[@#$!%*&^()_\-+=]/;

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'len', label: 'Min 8 characters', test: (pw) => pw.length >= 8 },
  { id: 'upper', label: 'At least 1 uppercase (A-Z)', test: (pw) => /[A-Z]/.test(pw) },
  { id: 'digit', label: 'At least 1 number (0-9)', test: (pw) => /[0-9]/.test(pw) },
  { id: 'special', label: 'At least 1 special (@#$!%*)', test: (pw) => SPECIAL_RE.test(pw) },
];

export interface PasswordRuleResult extends PasswordRule {
  met: boolean;
}

/** Evaluate every rule — for rendering the live checklist. */
export function passwordRuleResults(pw: string): PasswordRuleResult[] {
  return PASSWORD_RULES.map((r) => ({ ...r, met: r.test(pw) }));
}

export function isStrongPassword(pw: string): boolean {
  return PASSWORD_RULES.every((r) => r.test(pw));
}
