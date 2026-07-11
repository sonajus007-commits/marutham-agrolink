import type { ReactNode } from 'react';
import { cn } from './lib/cn';

/* The phone-width role navigation — the scrolling tab bar every mobile role
 * (Consumer, Farmer, and later VCO/Delivery) wears under its header. Replaces
 * the hand-written `.ma-tabs`/`.ma-tab`/`.ma-tab__badge` classes.
 *
 * NOT <Tabs>: that drives Radix tabpanels within one screen. Here each tab swaps
 * a whole screen subtree the caller owns, so this component only reports the
 * selection — it renders no panel. The active tab carries `aria-current`. */

export interface TabBarItem {
  id: string;
  label: ReactNode;
  /** Optional count shown after the label; falsy (incl. 0) hides it. */
  badge?: ReactNode;
}

export interface TabBarProps {
  items: TabBarItem[];
  active: string;
  onSelect: (id: string) => void;
  'aria-label'?: string;
  className?: string;
}

const TAB_CLASS =
  'flex-1 cursor-pointer whitespace-nowrap border-0 bg-transparent font-sans ' +
  'rounded-[10px] px-2.5 py-[9px] text-xs font-bold text-fg-muted ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf';

export function TabBar({ items, active, onSelect, className, ...rest }: TabBarProps) {
  return (
    <nav
      className={cn('flex gap-1 overflow-x-auto border-b border-surface-muted bg-surface px-2.5 py-2', className)}
      aria-label={rest['aria-label']}
    >
      {items.map((tb) => {
        const on = tb.id === active;
        return (
          <button
            key={tb.id}
            type="button"
            className={cn(TAB_CLASS, on && 'bg-success-bg text-forest')}
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(tb.id)}
          >
            {tb.label}
            {tb.badge ? (
              <span className="ml-1 rounded-full bg-danger px-[5px] py-px text-[9px] font-extrabold text-danger-on">
                {tb.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
