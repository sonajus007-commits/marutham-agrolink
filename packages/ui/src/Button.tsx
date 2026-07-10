import type { ButtonHTMLAttributes } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './lib/cn';

/* Preflight is not enabled yet (see apps/web/src/tailwind.css), so the
 * user-agent's button styles are still live: `appearance-none` and `border-0`
 * do the reset this one element needs, and `font-sans` stops it falling back to
 * the system font. All three come out when preflight lands. */
const button = cva(
  [
    'inline-flex items-center justify-center appearance-none border-0 cursor-pointer',
    'font-sans font-bold text-md rounded-sm px-5 py-[11px]',
    'transition-[transform,box-shadow,background-color] duration-[var(--duration-base)] ease-standard',
    'active:translate-y-px',
    'disabled:opacity-55 disabled:cursor-not-allowed',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-on shadow-base enabled:hover:bg-primary-hover',
        ghost: 'bg-transparent text-primary shadow-[inset_0_0_0_1.5px_var(--border-subtle)]',
        danger: 'bg-danger text-danger-on enabled:hover:bg-red-dark',
      },
      block: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', block: false },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  block?: boolean;
}

export function Button({ variant = 'primary', block = false, className, ...rest }: ButtonProps) {
  return <button className={cn(button({ variant, block }), className)} {...rest} />;
}
