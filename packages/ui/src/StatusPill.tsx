import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
import { cn } from './lib/cn';

/* A status drawn as a toned pill with an optional leading icon and a colour dot.
 *
 * Shares the exact tone pairs the <Badge> uses (each `<role>Bg` tint under its
 * `<role>Fg` ink — asserted at AA by check-contrast.mjs), but adds the two things
 * an order/task status needs on a mobile screen: a leading glyph and a solid dot,
 * so the state reads by SHAPE as well as colour (axe flags colour-only state).
 * Pair it with @marutham/lib `statusTone(status)` to map an order status → tone. */

export type PillTone = 'neutral' | 'success' | 'danger' | 'info' | 'warning';

const pill = cva(
  'inline-flex items-center gap-1.5 font-sans font-bold rounded-pill leading-snug whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-success-bg text-primary',
        success: 'bg-success-bg text-success-fg',
        danger: 'bg-danger-bg text-danger-fg',
        info: 'bg-info-bg text-info-fg',
        warning: 'bg-warning-bg text-warning-fg',
      },
      size: {
        sm: 'text-2xs px-2 py-0.5',
        md: 'text-xs px-[9px] py-[3px]',
      },
    },
    defaultVariants: { tone: 'neutral', size: 'md' },
  },
);

const DOT_TONE: Record<PillTone, string> = {
  neutral: 'bg-primary',
  success: 'bg-success',
  danger: 'bg-danger',
  info: 'bg-info',
  warning: 'bg-warning-strong',
};

export interface StatusPillProps {
  tone?: PillTone;
  size?: 'sm' | 'md';
  /** A small line icon shown before the label. Sized to the pill. */
  icon?: ReactNode;
  /** Show a solid colour dot before the label (a non-colour-only shape cue). */
  dot?: boolean;
  children: ReactNode;
  className?: string;
}

export function StatusPill({
  tone = 'neutral',
  size = 'md',
  icon,
  dot,
  children,
  className,
}: StatusPillProps) {
  return (
    <span className={cn(pill({ tone, size }), className)}>
      {dot ? (
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT_TONE[tone])} />
      ) : null}
      {icon ? (
        <span aria-hidden="true" className="inline-flex [&_svg]:h-3.5 [&_svg]:w-3.5">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}
