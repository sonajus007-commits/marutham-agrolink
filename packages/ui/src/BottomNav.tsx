import type { ReactNode } from 'react';
import { cn } from './lib/cn';

/* The fixed bottom navigation every mobile role wears — the reference's 4–5
 * destination bar (Home · Shop · Cart · Orders · Account, and the role variants).
 * Icon over label, an active destination in brand green, an optional badge for
 * counts (cart items, unread). Pins to the bottom of the viewport and pads for
 * the gesture bar via `env(safe-area-inset-bottom)`.
 *
 * NOT <TabBar>: that is a scrolling row of text tabs inside a screen. This is the
 * app's primary nav — few, fixed, icon-led destinations — so it takes an icon per
 * item and never scrolls. Give the page bottom padding so content clears the bar. */

export interface BottomNavItem {
  id: string;
  label: ReactNode;
  icon: ReactNode;
  /** Count shown as a badge on the icon; falsy (incl. 0) hides it. */
  badge?: ReactNode;
}

export interface BottomNavProps {
  items: BottomNavItem[];
  active: string;
  onSelect: (id: string) => void;
  'aria-label'?: string;
  className?: string;
}

export function BottomNav({ items, active, onSelect, className, ...rest }: BottomNavProps) {
  return (
    <nav
      aria-label={rest['aria-label'] ?? 'Primary'}
      className={cn(
        'fixed inset-x-0 bottom-0 z-[var(--z-sticky)] flex items-stretch border-t border-surface-muted bg-surface',
        'pb-[env(safe-area-inset-bottom)]',
        className,
      )}
    >
      {items.map((it) => {
        const on = it.id === active;
        return (
          <button
            key={it.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(it.id)}
            className={cn(
              'flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 py-2 font-sans',
              'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf',
              on ? 'text-forest' : 'text-fg-muted',
            )}
          >
            <span className="relative inline-flex [&_svg]:h-6 [&_svg]:w-6">
              {it.icon}
              {it.badge ? (
                <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-danger px-1 py-px text-center text-2xs font-extrabold text-danger-on">
                  {it.badge}
                </span>
              ) : null}
            </span>
            <span className={cn('text-2xs', on ? 'font-bold' : 'font-semibold')}>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
