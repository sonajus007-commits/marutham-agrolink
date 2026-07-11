import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './lib/cn';

/* A bordered icon button — the header affordance (profile toggle, logout) shared
 * by the mobile role shells. Replaces `.ma-iconbtn`. `active` is the old `.on`
 * pressed styling; the caller still owns `aria-pressed`/`aria-label`. */

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const ICONBTN_CLASS =
  'cursor-pointer rounded-[10px] border border-tint-300 bg-surface px-[11px] py-1.5 ' +
  'text-sm text-forest ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf';

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { active = false, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(ICONBTN_CLASS, active && 'border-leaf bg-success-bg', className)}
      {...rest}
    />
  );
});
