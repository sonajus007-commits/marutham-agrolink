import type { ReactNode } from 'react';
import { cn } from './lib/cn';

/* The sticky bottom action bar a task screen wears — where the one big primary
 * action lives (MARK PACKED, DELIVERED, Pass / Hold / Reject) so the thumb always
 * knows where to reach. Pins to the bottom of its scroll container, sits above
 * the content on a raised surface, and pads for the phone's gesture bar via
 * `env(safe-area-inset-bottom)`.
 *
 * `fixed` by default (pinned to the viewport, for a full-screen flow); pass
 * `sticky` to pin it to the bottom of a scrolling panel instead. It reserves no
 * space itself — give the scroll area bottom padding so the last row clears it. */

export interface ActionBarProps {
  children: ReactNode;
  /** Pin to the scroll container instead of the viewport. */
  sticky?: boolean;
  /** Optional summary line (e.g. total, count) shown above the actions. */
  summary?: ReactNode;
  className?: string;
}

export function ActionBar({ children, sticky, summary, className }: ActionBarProps) {
  return (
    <div
      className={cn(
        sticky ? 'sticky' : 'fixed',
        'inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-surface-muted bg-surface px-4 pt-3',
        'pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]',
        'shadow-[0_-2px_16px_rgba(26,61,43,0.09)]',
        className,
      )}
    >
      {summary ? (
        <div className="mb-2 flex items-center justify-between text-sm font-bold text-fg">
          {summary}
        </div>
      ) : null}
      <div className="flex items-center gap-2 [&>*]:flex-1">{children}</div>
    </div>
  );
}
