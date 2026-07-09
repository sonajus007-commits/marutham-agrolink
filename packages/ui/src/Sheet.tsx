import { useEffect, type ReactNode } from 'react';
import { useEscapeDismiss } from './useEscapeDismiss';

export interface SheetProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Full-screen mobile overlay ("action sheet"). Accessible upgrade over the
 * legacy div overlays: role="dialog", aria-modal, Escape-to-close, and it locks
 * background scroll while open.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  useEscapeDismiss(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="ma-sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : 'Dialog'}>
      <div className="ma-sheet__hdr">
        <button className="ma-sheet__back" onClick={onClose} aria-label="Back">
          ←
        </button>
        <div className="ma-sheet__title">{title}</div>
      </div>
      <div className="ma-sheet__body">{children}</div>
    </div>
  );
}
