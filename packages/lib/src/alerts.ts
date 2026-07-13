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
  type: string;
  severity: string;
  message: string;
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
