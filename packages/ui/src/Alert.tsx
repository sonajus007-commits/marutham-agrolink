import type { ReactNode } from 'react';
import { Info, CheckCircle2, AlertTriangle, AlertCircle, X } from 'lucide-react';
import { cn } from './lib/cn';

/* An inline, persistent callout — info, success, warning or danger.
 *
 * Not a <Toast>: a toast is transient and floats over the page for a few
 * seconds. This sits in the layout and stays until the situation changes or the
 * user dismisses it — the suspended-seller banner, an expiring subscription, a
 * form-level error summary.
 *
 * Each tone draws from its semantic pair: the tint (`{tone}-bg`) as the fill and
 * `{tone}-fg` for text, which is the darkened, WCAG-checked ink the contrast
 * audit settled on (warning uses `warning-fg` on its tint, not the 2.09:1 gold).
 * The icon carries the tone at full strength. */

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  /** Bold lead line. Optional — a one-line alert can be body only. */
  title?: ReactNode;
  children?: ReactNode;
  /** An action row under the body — e.g. a <Button variant="ghost">. */
  action?: ReactNode;
  /** Show a ✕ that calls this. Omit for a non-dismissible alert. */
  onDismiss?: () => void;
  className?: string;
}

const TONE: Record<AlertTone, { wrap: string; icon: string; Icon: typeof Info; label: string }> = {
  info: { wrap: 'bg-info-bg text-info-fg', icon: 'text-info', Icon: Info, label: 'Information' },
  success: { wrap: 'bg-success-bg text-success-fg', icon: 'text-success', Icon: CheckCircle2, label: 'Success' },
  warning: { wrap: 'bg-warning-bg text-warning-fg', icon: 'text-warning-strong', Icon: AlertTriangle, label: 'Warning' },
  danger: { wrap: 'bg-danger-bg text-danger-fg', icon: 'text-danger', Icon: AlertCircle, label: 'Error' },
};

export function Alert({ tone = 'info', title, children, action, onDismiss, className }: AlertProps) {
  const t = TONE[tone];
  const Icon = t.Icon;

  return (
    <div
      // Danger and warning interrupt; info and success can wait for the reader.
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-md px-3.5 py-3', t.wrap, className)}
    >
      <Icon size={18} aria-label={t.label} className={cn('mt-px shrink-0', t.icon)} />

      <div className="min-w-0 flex-1">
        {title ? <p className="font-sans text-sm font-bold leading-snug">{title}</p> : null}
        {children ? (
          <div className={cn('font-sans text-sm leading-normal', title && 'mt-0.5')}>{children}</div>
        ) : null}
        {action ? <div className="mt-2 flex gap-2">{action}</div> : null}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn(
            'inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center',
            'rounded-xs border-0 bg-transparent p-0.5 opacity-70',
            'hover:opacity-100',
            'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-current',
          )}
        >
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
