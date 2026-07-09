import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useEscapeDismiss } from './useEscapeDismiss';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Action row pinned to the bottom of the dialog. */
  footer?: ReactNode;
}

/**
 * Centred confirmation dialog — the small-decision counterpart to <Sheet>,
 * which takes over the whole screen and suits browsing, not confirming.
 *
 * Accessibility: role="dialog" + aria-modal, labelled by its heading, closes on
 * Escape and on backdrop click, locks background scroll, moves focus in on open
 * and restores it to the trigger on close.
 */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEscapeDismiss(open, onClose);

  useEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement as HTMLElement | null;
    // Nested locks nest correctly: the Sheet beneath restores 'hidden', not ''.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      restoreTo?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="ma-modal__bg"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ma-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="ma-modal__hdr">
          <h3 id={titleId} className="ma-modal__title">{title}</h3>
          <button className="ma-modal__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="ma-modal__body">{children}</div>
        {footer ? <div className="ma-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
