import type { ReactNode } from 'react';
import * as RadixTabs from '@radix-ui/react-tabs';
import { cn } from './lib/cn';

/* Content tabs, on Radix.
 *
 * Radix supplies what hand-rolled tabs almost always miss: a roving tabindex,
 * Left/Right/Home/End on the tab list, and the `aria-controls` /
 * `aria-labelledby` pairing between each tab and its panel.
 *
 * Not to be confused with <TabBar>, the mobile shell's *navigation* tabs —
 * those swap whole screens, and their correct role is a nav, not a tablist.
 * These switch panels within one screen. Do not merge them.
 *
 * Uncontrolled by default; pass `value` + `onValueChange` to control it. */

export interface TabItem {
  value: string;
  label: string;
  /** A count or dot beside the label. */
  badge?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  /** Names the tab list for a screen reader. */
  'aria-label'?: string;
  className?: string;
}

/* Preflight is off, so the trigger resets its own <button> styles. The active
 * underline is an inset shadow rather than a border: a border would shift the
 * label by a pixel as it appears. */
const TRIGGER =
  'appearance-none border-0 bg-transparent cursor-pointer whitespace-nowrap ' +
  'font-sans text-sm font-bold px-3 py-2.5 -mb-px ' +
  'inline-flex items-center gap-1.5 text-fg-muted ' +
  'hover:text-fg ' +
  'data-[state=active]:text-primary ' +
  'data-[state=active]:shadow-[inset_0_-2px_0_var(--leaf)] ' +
  'disabled:opacity-55 disabled:cursor-not-allowed ' +
  'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-leaf';

export function Tabs({
  items, value, defaultValue, onValueChange, className, 'aria-label': ariaLabel,
}: TabsProps) {
  return (
    <RadixTabs.Root
      value={value}
      defaultValue={defaultValue ?? items[0]?.value}
      onValueChange={onValueChange}
      className={cn('flex flex-col gap-4', className)}
    >
      <RadixTabs.List
        aria-label={ariaLabel}
        className="flex overflow-x-auto border-b border-border-subtle"
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={TRIGGER}
          >
            {item.label}
            {item.badge != null ? (
              <span className="rounded-pill bg-surface-muted px-1.5 py-0.5 text-2xs font-bold text-fg-muted">
                {item.badge}
              </span>
            ) : null}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>

      {items.map((item) => (
        <RadixTabs.Content
          key={item.value}
          value={item.value}
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
        >
          {item.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}
