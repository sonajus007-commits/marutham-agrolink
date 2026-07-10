import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './lib/cn';

/* The text form control, on Tailwind — the replacement for `.ma-input` that
 * apps/web screens wrote by hand. The first primitive of the Phase 4 form-screen
 * migration; Select and Textarea join it as their screens move over.
 *
 * `INPUT_CLASS` is exported so a `<select>` or `<textarea>` can wear the same
 * border, focus ring and invalid state without re-deriving them.
 *
 * Styling reads `aria-invalid`, which <Field> already sets when it has an error,
 * so a field goes red with no extra prop. Preflight is off, hence
 * `appearance-none`; the focus ring is a box-shadow, so it hugs the radius. */

export const INPUT_CLASS =
  'w-full appearance-none rounded-sm border-[1.5px] border-border-strong bg-surface ' +
  'px-3 py-2.5 font-sans text-sm text-fg outline-none placeholder:text-fg-muted ' +
  'focus:border-leaf focus:shadow-[0_0_0_3px_var(--focus-ring)] ' +
  'aria-[invalid=true]:border-danger ' +
  'disabled:cursor-not-allowed disabled:bg-tint-25';

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(INPUT_CLASS, className)} {...rest} />;
});
