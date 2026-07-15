import { cn } from './lib/cn';

/* A determinate or indeterminate progress bar.
 *
 * Pass `value` when the end is known — an upload at 62%, a seller's onboarding
 * checklist. Omit it and the bar sweeps: that is the honest rendering of work
 * whose duration nobody knows, and it deliberately carries no `aria-valuenow`,
 * because "unknown" is not a number.
 *
 * Not a Spinner. A spinner says "waiting"; this says "waiting, and here is how
 * much is left." Prefer the spinner when there is no length to report. */

export interface ProgressBarProps {
  /** 0…max. Omit for an indeterminate bar. Values outside the range are clamped. */
  value?: number;
  max?: number;
  /** Names the bar for a screen reader. Required — a bare bar announces nothing. */
  label: string;
  /** Render the percentage beside the track. Ignored when indeterminate. */
  showValue?: boolean;
  size?: 'sm' | 'md';
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  className?: string;
}

const TONE: Record<NonNullable<ProgressBarProps['tone']>, string> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function ProgressBar({
  value,
  max = 100,
  label,
  showValue = false,
  size = 'md',
  tone = 'primary',
  className,
}: ProgressBarProps) {
  const indeterminate = value == null;
  const safeMax = max > 0 ? max : 100;
  const clamped = indeterminate ? 0 : Math.min(safeMax, Math.max(0, value));
  const pct = (clamped / safeMax) * 100;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={indeterminate ? undefined : clamped}
        className={cn(
          'relative flex-1 overflow-hidden rounded-pill bg-surface-muted',
          size === 'sm' ? 'h-1' : 'h-2',
        )}
      >
        {indeterminate ? (
          /* The sweep is the only thing reporting progress here, so it survives
           * `prefers-reduced-motion` — stopping it would leave a bar that says
           * nothing. The keyframe travels far enough to clear a third-width
           * bar off both ends. */
          <div
            className={cn(
              'absolute inset-y-0 left-0 w-1/3 rounded-pill animate-progress-slide',
              TONE[tone],
            )}
          />
        ) : (
          <div
            className={cn(
              'h-full rounded-pill transition-[width] ease-standard',
              'duration-[var(--duration-base)] motion-reduce:transition-none',
              TONE[tone],
            )}
            style={{ width: pct + '%' }}
          />
        )}
      </div>

      {showValue && !indeterminate ? (
        <span className="text-2xs font-bold tabular-nums text-fg-muted">{Math.round(pct)}%</span>
      ) : null}
    </div>
  );
}
