import { useEffect, useId, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { INPUT_CLASS } from './Input';

/** Optional free-text reason captured alongside the confirmation. */
export interface ConfirmReason {
  /** Field label above the textarea. */
  label: string;
  placeholder?: string;
  /** When true the Confirm button stays disabled until the reason is non-blank. */
  required?: boolean;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Supporting line under the title — usually the subject (a name, an order code). */
  subtitle?: ReactNode;
  /** The consequence, stated plainly. A confirm that says only "are you sure?"
   *  leaves the person guessing at what actually happens. */
  children: ReactNode;
  /** Fires with the trimmed reason (or undefined when no reason field is shown). */
  onConfirm: (reason?: string) => void;
  onClose: () => void;
  confirmLabel: string;
  cancelLabel: string;
  /** Confirm button tone. Defaults to the destructive red — this dialog exists to
   *  gate dangerous actions. */
  tone?: 'danger' | 'primary';
  /** True while the confirmed action is in flight; disables both buttons. */
  busy?: boolean;
  /** Show a reason textarea and pass its value to onConfirm. */
  reason?: ConfirmReason;
}

/**
 * The one confirmation gate for a dangerous action — suspend an account, force an
 * order's stage, deny a refund. Wraps <Modal> so every such prompt shares the same
 * focus trap, Escape/backdrop dismissal, action row and copy shape, instead of each
 * sheet hand-rolling its own <Modal> + show-state + footer.
 *
 * The reason, when asked for, is owned here and reset whenever the dialog closes, so
 * a cancelled prompt never leaks a half-typed reason into the next open.
 */
export function ConfirmDialog({
  open,
  title,
  subtitle,
  children,
  onConfirm,
  onClose,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  busy = false,
  reason,
}: ConfirmDialogProps) {
  const [text, setText] = useState('');
  const reasonId = useId();

  // A fresh prompt starts with an empty reason — clear it as the dialog closes so
  // the value can't survive into an unrelated confirmation.
  useEffect(() => {
    if (!open) setText('');
  }, [open]);

  const reasonMissing = Boolean(reason?.required) && !text.trim();

  return (
    <Modal
      open={open}
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            onClick={() => onConfirm(reason ? text.trim() || undefined : undefined)}
            disabled={busy || reasonMissing}
          >
            {busy ? '…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-normal text-fg">{children}</div>
      {reason ? (
        <div className="mt-3">
          <label
            htmlFor={reasonId}
            className="mb-1 block text-2xs font-bold uppercase tracking-wide text-fg-muted"
          >
            {reason.label}
          </label>
          <textarea
            id={reasonId}
            aria-label={reason.label}
            className={INPUT_CLASS}
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={reason.placeholder}
          />
        </div>
      ) : null}
    </Modal>
  );
}
