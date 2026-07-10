import type { HTMLAttributes } from 'react';
import { cn } from './lib/cn';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border border-border-subtle rounded-base shadow-base p-5',
        className,
      )}
      {...rest}
    />
  );
}
