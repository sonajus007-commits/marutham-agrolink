/* Notification-list logic for <NotificationCenter> in @marutham/ui.
 *
 * Pure and DOM-free — testable without a renderer, portable to React Native, the
 * same split as table.ts / calendar.ts / upload.ts.
 *
 * Unlike calendar.ts, the times here are real instants (an ISO timestamp with a
 * zone), not bare calendar days, so they are read in *local* time on purpose: a
 * notification that fired at 23:00 should say "Today" to the person reading it,
 * wherever they are. That is the correct behaviour here and the exact opposite
 * of the picker, where a bare day must never be shifted by a zone. */

export type NotificationTone = 'info' | 'success' | 'warning' | 'danger';

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  /** ISO timestamp of when it fired. */
  time: string;
  read?: boolean;
  tone?: NotificationTone;
}

export function unreadCount(items: NotificationItem[]): number {
  return items.reduce((n, it) => n + (it.read ? 0 : 1), 0);
}

/** Immutable: mark one item read, leaving the rest untouched. */
export function markRead(items: NotificationItem[], id: string): NotificationItem[] {
  return items.map((it) => (it.id === id && !it.read ? { ...it, read: true } : it));
}

export function markAllRead(items: NotificationItem[]): NotificationItem[] {
  return items.map((it) => (it.read ? it : { ...it, read: true }));
}

/**
 * A short "time ago". A notification instant is compared to `now` (injectable so
 * this is deterministic under test). Beyond a week it becomes an absolute date,
 * because "63 days ago" reads worse than the date itself.
 */
export function relativeTime(iso: string, now: number = Date.now(), locale = 'en-IN'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.round((now - then) / 1000);

  if (secs < 0) return 'just now'; // a future/near-future stamp is not "in N min"
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return mins + (mins === 1 ? ' min ago' : ' mins ago');
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return days + ' days ago';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(then);
}

export interface NotificationGroup {
  /** 'Today' | 'Yesterday' | 'Earlier'. */
  label: string;
  items: NotificationItem[];
}

/** Local Y-M-D of an instant, as a comparable number YYYYMMDD. */
function localDayNumber(ms: number): number {
  const d = new Date(ms);
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/**
 * Bucket into Today / Yesterday / Earlier by *local calendar day*, newest first
 * within each bucket. Empty buckets are dropped, so the caller can render
 * `groups` straight through without checking for holes. A future-dated item
 * falls in with Today.
 */
export function groupByRecency(
  items: NotificationItem[],
  now: number = Date.now(),
): NotificationGroup[] {
  const todayNo = localDayNumber(now);
  // Yesterday is "now minus a day", computed on the calendar, not now − 86.4e6,
  // so it stays correct across a daylight-saving shift.
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterdayNo = localDayNumber(y.getTime());

  const buckets: Record<string, NotificationItem[]> = { Today: [], Yesterday: [], Earlier: [] };
  const sorted = [...items].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  for (const it of sorted) {
    const dayNo = localDayNumber(new Date(it.time).getTime());
    if (dayNo >= todayNo) buckets.Today!.push(it);
    else if (dayNo === yesterdayNo) buckets.Yesterday!.push(it);
    else buckets.Earlier!.push(it);
  }

  return (['Today', 'Yesterday', 'Earlier'] as const)
    .filter((label) => buckets[label]!.length > 0)
    .map((label) => ({ label, items: buckets[label]! }));
}
