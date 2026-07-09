import type { ButtonHTMLAttributes } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger';
  block?: boolean;
}

export function Button({ variant = 'primary', block = false, className = '', ...rest }: ButtonProps) {
  const classes = [
    'ma-btn',
    `ma-btn--${variant}`,
    block ? 'ma-btn--block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return <button className={classes} {...rest} />;
}
