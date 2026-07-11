import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './lib/cn';

/* The text form control, on Tailwind — the replacement for `.ma-input` that
 * apps/web screens wrote by hand. The first primitive of the Phase 4 form-screen
 * migration; Select and Textarea join it as their screens move over.
 *
 * `CONTROL_CLASS` holds everything a text input, a select and a textarea share —
 * border, background, focus ring and invalid/disabled states — so the three read
 * as one control. `INPUT_CLASS` adds the input's own padding and, because
 * preflight is off, `appearance-none`. <Select> (see Select.tsx) deliberately
 * leaves appearance alone so the native dropdown arrow survives.
 *
 * Styling reads `aria-invalid`, which <Field> already sets when it has an error,
 * so a field goes red with no extra prop. The focus ring is a box-shadow, so it
 * hugs the radius. */

export const CONTROL_CLASS =
  'w-full rounded-sm border-[1.5px] border-border-strong bg-surface ' +
  'font-sans text-fg outline-none placeholder:text-fg-muted ' +
  'focus:border-leaf focus:shadow-[0_0_0_3px_var(--focus-ring)] ' +
  'aria-[invalid=true]:border-danger ' +
  'disabled:cursor-not-allowed disabled:bg-tint-25';

export const INPUT_CLASS = CONTROL_CLASS + ' appearance-none px-3 py-2.5 text-sm';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(INPUT_CLASS, className)} {...rest} />;
});
