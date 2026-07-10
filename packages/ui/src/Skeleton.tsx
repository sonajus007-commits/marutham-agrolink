import type { HTMLAttributes } from 'react';
import { cn } from './lib/cn';

/* A placeholder for content that has not arrived.
 *
 * Every skeleton is `aria-hidden`. A screen reader should hear the container's
 * `aria-busy="true"` and then the real content, never a description of grey
 * boxes — so the caller owns the announcement:
 *
 *   <section aria-busy={loading}>
 *     {loading ? <SkeletonText lines={3} /> : <p>{body}</p>}
 *   </section>
 *
 * Size it with utilities: <Skeleton className="h-9 w-40" />. */

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-sm bg-surface-muted', className)}
      {...rest}
    />
  );
}

/** Stacked lines of text. The last is short, the way a paragraph's last line is. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: Math.max(1, lines) }, (_, i) => (
        <Skeleton key={i} className={cn('h-3', i === lines - 1 && lines > 1 && 'w-3/5')} />
      ))}
    </div>
  );
}
