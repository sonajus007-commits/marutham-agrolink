import type { ReactNode } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Bell, Check } from 'lucide-react';
import {
  type NotificationItem, type NotificationTone,
  unreadCount, groupByRecency, relativeTime,
} from '@marutham/lib';
import { cn } from './lib/cn';

/* The header notification centre: a bell with an unread badge, opening a Radix
 * Popover panel of read/unread items grouped Today / Yesterday / Earlier.
 *
 * The list logic — the unread count, the recency grouping, the "time ago" — is
 * in @marutham/lib/notifications, pure and unit-tested. This file is the bell,
 * the panel and the ARIA.
 *
 * Controlled and transport-free: the app owns `items` and reacts to the
 * callbacks. Distinct from <Toast> (transient, floats, fire-and-forget) and from
 * <Alert> (one persistent in-page callout) — this is the standing inbox. */

export interface NotificationCenterProps {
  items: NotificationItem[];
  /** Activating an item — usually navigate to it and mark it read. */
  onItemClick?: (id: string) => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  /** Injectable clock for the relative times and grouping (test/SSR). */
  now?: number;
  locale?: string;
  emptyLabel?: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Names the bell for a screen reader. */
  'aria-label'?: string;
  className?: string;
}

const TONE_DOT: Record<NotificationTone, string> = {
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning-strong',
  danger: 'bg-danger',
};

export function NotificationCenter({
  items,
  onItemClick,
  onMarkRead,
  onMarkAllRead,
  now,
  locale = 'en-IN',
  emptyLabel = "You're all caught up",
  align = 'end',
  'aria-label': ariaLabel = 'Notifications',
  className,
}: NotificationCenterProps) {
  const unread = unreadCount(items);
  const groups = groupByRecency(items, now);

  const activate = (it: NotificationItem) => {
    if (!it.read) onMarkRead?.(it.id);
    onItemClick?.(it.id);
  };

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={unread ? ariaLabel + ' (' + unread + ' unread)' : ariaLabel}
        className={cn(
          'relative inline-flex cursor-pointer appearance-none items-center justify-center',
          'rounded-sm border-0 bg-transparent p-2 text-fg-muted',
          'hover:bg-surface-muted hover:text-fg',
          'data-[state=open]:bg-surface-muted data-[state=open]:text-fg',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
          className,
        )}
      >
        <Bell size={20} aria-hidden="true" />
        {unread ? (
          // Count pill. aria-hidden — the trigger's label already states the count.
          <span
            aria-hidden="true"
            className={cn(
              'absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center',
              'rounded-full bg-danger px-1 text-2xs font-bold leading-none text-danger-on',
            )}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          sideOffset={8}
          aria-label={ariaLabel}
          className={cn(
            'z-[var(--z-overlay)] flex max-h-[min(32rem,80vh)] w-[min(22rem,calc(100vw-1.5rem))] flex-col',
            'rounded-md border border-border-subtle bg-surface-raised shadow-md',
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-3.5 py-2.5">
            <span className="font-sans text-sm font-bold text-fg">{ariaLabel}</span>
            <button
              type="button"
              onClick={() => onMarkAllRead?.()}
              disabled={!unread}
              className={cn(
                'inline-flex cursor-pointer appearance-none items-center gap-1 rounded-xs border-0 bg-transparent',
                'px-1.5 py-1 font-sans text-xs font-bold text-primary',
                'hover:bg-surface-muted',
                'disabled:cursor-not-allowed disabled:text-fg-muted disabled:opacity-55 disabled:hover:bg-transparent',
                'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-leaf',
              )}
            >
              <Check size={13} aria-hidden="true" />
              Mark all read
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {groups.length === 0 ? (
              <p className="px-4 py-10 text-center font-sans text-sm text-fg-muted">{emptyLabel}</p>
            ) : (
              groups.map((group) => (
                <section key={group.label} aria-label={group.label}>
                  <h3 className="sticky top-0 bg-surface-raised px-3.5 pb-1 pt-2.5 text-2xs font-bold uppercase tracking-wide text-fg-muted">
                    {group.label}
                  </h3>
                  <ul>
                    {group.items.map((it) => (
                      <li key={it.id}>
                        <button
                          type="button"
                          onClick={() => activate(it)}
                          className={cn(
                            'flex w-full cursor-pointer appearance-none gap-2.5 border-0 border-b border-border-subtle',
                            'px-3.5 py-2.5 text-left',
                            it.read ? 'bg-transparent' : 'bg-accent-bg/40',
                            'hover:bg-surface-muted',
                            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf',
                          )}
                        >
                          {/* Unread marker; a tone colours it, else it is the brand dot. */}
                          <span className="flex w-2 shrink-0 justify-center pt-1.5">
                            {!it.read ? (
                              <span
                                aria-label="Unread"
                                className={cn(
                                  'block h-2 w-2 rounded-full',
                                  it.tone ? TONE_DOT[it.tone] : 'bg-primary',
                                )}
                              />
                            ) : null}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block font-sans text-sm leading-snug',
                                it.read ? 'font-normal text-fg-muted' : 'font-bold text-fg',
                              )}
                            >
                              {it.title}
                            </span>
                            {it.description ? (
                              <span className="mt-0.5 block font-sans text-xs leading-normal text-fg-muted">
                                {it.description}
                              </span>
                            ) : null}
                            <time
                              dateTime={it.time}
                              className="mt-1 block font-sans text-2xs tabular-nums text-fg-muted"
                            >
                              {relativeTime(it.time, now, locale)}
                            </time>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
