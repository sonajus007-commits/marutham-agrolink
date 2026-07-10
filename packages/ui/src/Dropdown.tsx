import type { ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { cn } from './lib/cn';

/* An actions menu, on Radix DropdownMenu.
 *
 * This is a *menu*, not a select: every item runs a command. A field that picks
 * a value is a `<select>` and must stay one — screen readers and Android's
 * native picker both depend on it.
 *
 * Radix gives the roving focus, type-ahead, Escape, outside-click, collision
 * flipping near a viewport edge, and the `aria-haspopup`/`aria-expanded` pair.
 *
 * The trigger is Radix's own <button> with the caller's node inside, rather than
 * `asChild` around our <Button>: on React 18 `asChild` clones the child with a
 * ref, and none of our components forward one. Pass `triggerClassName` to
 * restyle it. */

export interface DropdownItem {
  label: string;
  onSelect: () => void;
  /** A lucide icon, sized 14. Decorative — the label carries the meaning. */
  icon?: ReactNode;
  disabled?: boolean;
  /** Destructive ink. Put a 'separator' above it. */
  danger?: boolean;
}

export interface DropdownProps {
  /** Rendered inside the trigger button. */
  trigger: ReactNode;
  items: (DropdownItem | 'separator')[];
  /** Names the trigger. Required when `trigger` is a bare icon. */
  'aria-label'?: string;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  triggerClassName?: string;
  className?: string;
}

const TRIGGER =
  'inline-flex cursor-pointer appearance-none items-center justify-center gap-1.5 ' +
  'rounded-sm border-0 bg-transparent px-2 py-1.5 font-sans text-sm font-bold text-fg-muted ' +
  'hover:bg-surface-muted hover:text-fg ' +
  'data-[state=open]:bg-surface-muted data-[state=open]:text-fg ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf';

/* Radix marks the item under the cursor *or* the keyboard with `data-highlighted`,
 * so one rule covers hover and arrow keys, and the item itself takes no outline. */
const ITEM =
  'flex cursor-pointer select-none items-center gap-2.5 rounded-xs px-2.5 py-2 ' +
  'font-sans text-sm text-fg outline-none ' +
  'data-[highlighted]:bg-surface-muted ' +
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-55';

const DANGER = 'text-danger data-[highlighted]:bg-danger-bg';

/* Sits at the overlay layer so a menu opened from inside a Modal clears it.
 * Radix portals to the end of <body>, so a dialog opened *later* still wins on
 * DOM order — which is what should happen.
 *
 * A real border, not Button's `shadow-[inset_…]` trick: `shadow-md` and an inset
 * shadow are one tailwind-merge group, and the second would quietly delete the
 * first. `border` needs no preflight — Tailwind v4 gives `--tw-border-style` an
 * initial value of `solid` through `@property`. */
const CONTENT =
  'z-[var(--z-overlay)] min-w-[180px] rounded-md p-1 ' +
  'border border-border-subtle bg-surface-raised shadow-md';

export function Dropdown({
  trigger,
  items,
  align = 'end',
  side = 'bottom',
  triggerClassName,
  className,
  'aria-label': ariaLabel,
}: DropdownProps) {
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={ariaLabel} className={cn(TRIGGER, triggerClassName)}>
        {trigger}
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Content align={align} side={side} sideOffset={6} className={cn(CONTENT, className)}>
          {items.map((item, i) =>
            item === 'separator' ? (
              /* No dash in the key: `pnpm ui:classes` reads any dashed string
                 literal in this package as a Tailwind class. */
              <Menu.Separator key={'separator' + i} className="my-1 h-px bg-border-subtle" />
            ) : (
              <Menu.Item
                key={item.label}
                disabled={item.disabled}
                onSelect={() => item.onSelect()}
                className={cn(ITEM, item.danger && DANGER)}
              >
                {item.icon ? (
                  <span aria-hidden="true" className="flex shrink-0 items-center">
                    {item.icon}
                  </span>
                ) : null}
                {item.label}
              </Menu.Item>
            ),
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
