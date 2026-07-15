import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './lib/cn';
import { CONTROL_CLASS } from './Input';

/* The <select> form control, on Tailwind — the replacement for `.ma-select`.
 * Shares CONTROL_CLASS with <Input>, so border, focus ring and invalid state
 * match, but does NOT set `appearance-none`: with preflight off that would strip
 * the native dropdown arrow, and a select with no affordance is a trap. Its
 * padding runs a touch tighter than the input's, matching the old `.ma-select`. */

export const SELECT_CLASS = CONTROL_CLASS + ' px-2.5 py-2 text-xs';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, ...rest },
  ref,
) {
  return <select ref={ref} className={cn(SELECT_CLASS, className)} {...rest} />;
});
