/* Dashboard alerts — the action-item list every role dashboard ends with.
 *
 * Executive, Operations and Admin Head all return the same
 * `{ type, severity, message }` shape from the backend and all render it the same
 * way, so the ordering and the severity→tone mapping belong here, once.
 *
 * They did not used to. executive.ts had `alertTone()` and operations.ts had a
 * byte-for-byte identical `opsAlertTone()`, and the barrel exported both — two
 * names for one idea, which is how the two screens would eventually have come to
 * disagree about what "high" looks like. Admin Head would have been the third
 * copy; this file is why it is not.
 */
import type { StatusTone } from './executive';

export interface DashboardAlert {
  /** A CODE ('delayed_payment', 'security', …) — what the alert IS. */
  type: string;
  severity: string;
  /**
   * The server's English sentence, numbers already interpolated. Kept as the
   * FALLBACK: a type the catalogue has not been taught yet still says something
   * true rather than rendering a bare key.
   */
  message: string;
  /**
   * The numbers behind the sentence, so a translated screen can rebuild it in
   * its own language and word order. The server used to send only `message`,
   * which made the alert list the one part of a Tamil dashboard that could not
   * be translated — the count was welded into English prose.
   */
  params?: Record<string, string | number>;
}

/** The i18n key for an alert type. Pair with `message` as the default. */
export function alertKey(type: string): string {
  return `admin.alert.${type}`;
}

const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * Action items, most urgent first.
 *
 * This list is a TO-DO, not a log: it gets worked top-down, so a stale payout
 * (high) must not sit below an unassigned order (low) merely because the server
 * appended it later. Ties keep the server's order, which is deliberate — it
 * groups alerts of the same kind together.
 *
 * An unknown severity sorts last rather than first: a severity we cannot read is
 * not evidence of urgency, and guessing "urgent" would push real high alerts off
 * the top of the list.
 */
export function sortAlerts<T extends DashboardAlert>(alerts: T[] | null | undefined): T[] {
  return [...(alerts || [])].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3),
  );
}

/** Alert severity → the design system's status vocabulary, so an alert means the
 *  same thing on every dashboard that shows one. */
export function alertTone(severity: string | null | undefined): StatusTone {
  if (severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'neutral';
}
