import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useEscapeDismiss } from './useEscapeDismiss';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Action row pinned to the bottom of the dialog. */
  footer?: ReactNode;
  /**
   * When false the dialog cannot be escaped: no close button, no backdrop
   * dismiss, no Escape. For gates the user must act on — e.g. a suspended
   * seller who has to choose a plan before they can sell.
   */
  dismissible?: boolean;
  /** Optional supporting line under the title. */
  subtitle?: ReactNode;
}

/**
 * Centred confirmation dialog — the small-decision counterpart to <Sheet>,
 * which takes over the whole screen and suits browsing, not confirming.
 *
 * Accessibility: role="dialog" + aria-modal, labelled by its heading, locks
 * background scroll, moves focus in on open and restores it to the trigger on
 * close. A dismissible dialog also closes on Escape and on backdrop click.
 */
export function Modal({ open, title, onClose, children, footer, dismissible = true, subtitle }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  // A non-dismissible dialog does not register on the escape stack at all, so
  // Escape falls through to whatever overlay sits beneath it — nothing here.
  useEscapeDismiss(open && dismissible, onClose);

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
        if (dismissible && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="ma-modal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className="ma-modal__hdr">
          <div>
            <h3 id={titleId} className="ma-modal__title">{title}</h3>
            {subtitle ? <p className="ma-modal__sub">{subtitle}</p> : null}
          </div>
          {dismissible ? (
            <button className="ma-modal__x" onClick={onClose} aria-label="Close">✕</button>
          ) : null}
        </div>
        <div className="ma-modal__body">{children}</div>
        {footer ? <div className="ma-modal__foot">{footer}</div> : null}
      </div>
    </div>
  );
}
