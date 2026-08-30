import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NotificationCenter } from '@marutham/ui';
import { api, type NotificationItem as ApiNotification } from '@marutham/api-client';
import type { NotificationItem, NotificationTone } from '@marutham/lib';

/* The header bell, wired to the in-app feed (migration 053). The presentation —
 * badge, popover, grouping, "time ago" — is the shared <NotificationCenter>; this
 * container owns only the data: fetch the feed, poll it, and map read/mark-read to
 * the API. One component, dropped into every portal header.
 *
 * Best-effort throughout: a failed poll leaves the last list on screen rather than
 * clearing the bell. Mark-read is optimistic so the badge responds instantly. */

// The backend type (order_placed, payout, …) → a UI tone for the unread dot.
function toneFor(type: string): NotificationTone {
  if (type === 'order_delivered' || type === 'payout' || type === 'registration_approved')
    return 'success';
  if (type === 'registration_rejected' || type === 'listing_rejected') return 'danger';
  if (type === 'new_order') return 'warning';
  return 'info';
}

function toUi(n: ApiNotification): NotificationItem {
  return {
    id: n.id,
    title: n.title,
    description: n.body || undefined,
    time: n.created_at,
    read: !!n.read_at,
    tone: toneFor(n.type),
  };
}

const POLL_MS = 60_000;

export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await api.getNotifications(20, 0);
      setItems(res.notifications.map(toUi));
    } catch {
      /* transient — keep whatever is on screen; the next poll retries */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    try {
      await api.markNotificationsRead({ id });
    } catch {
      /* optimistic — a failure just means the badge re-counts on the next poll */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await api.markNotificationsRead({ all: true });
    } catch {
      /* optimistic */
    }
  }, []);

  return (
    <NotificationCenter
      items={items}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
      locale={i18n.language === 'ta' ? 'ta-IN' : 'en-IN'}
      aria-label={t('notif.title', 'Notifications')}
      emptyLabel={t('notif.empty', "You're all caught up")}
    />
  );
}
