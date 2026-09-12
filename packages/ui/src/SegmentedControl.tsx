import type { ReactNode } from 'react';
import { cn } from './lib/cn';

/* An iOS-style segmented control — a compact, equal-width switch for 2–4 mutually
 * exclusive views (the "Sales · Supply · Quality · Trends" tabs the Category
 * Manager wears, a filter's "Active · All", a date range). Distinct from <TabBar>
 * (full-screen role nav) and <Tabs> (Radix tabpanels): this only reports the
 * selection and renders no panel, so the caller owns what each segment shows.
 *
 * The track is a muted pill; the active segment is a raised white chip. Selection
 * carries `aria-pressed`, and the group is a `role="tablist"` of buttons. */

export interface SegmentOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Optional count after the label; falsy (incl. 0) hides it. */
  badge?: ReactNode;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label'?: string;
  className?: string;
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
  ...rest
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={rest['aria-label']}
      className={cn(
        'inline-flex w-full items-stretch gap-1 rounded-pill bg-surface-muted p-1',
        className,
      )}
    >
      {options.map((opt) => {
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={on}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-pill border-0 px-3 py-2 font-sans text-sm font-bold whitespace-nowrap transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
              on ? 'bg-surface text-forest shadow-xs' : 'bg-transparent text-fg-muted',
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
            {opt.badge ? (
              <span
                className={cn(
                  'rounded-full px-1.5 text-2xs font-extrabold',
                  on ? 'bg-success-bg text-forest' : 'bg-surface text-fg-muted',
                )}
              >
                {opt.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
