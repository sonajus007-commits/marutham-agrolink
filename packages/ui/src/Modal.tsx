import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useReturnFocus } from './lib/useReturnFocus';

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
  /** Accessible name for the ✕. English by default. */
  closeLabel?: string;
}

/**
 * Centred confirmation dialog — the small-decision counterpart to <Sheet>,
 * which takes over the whole screen and suits browsing, not confirming.
 *
 * Radix Dialog provides the focus trap, focus restoration to the trigger, the
 * scroll lock and Escape. `dismissible={false}` closes all three exits: the ✕ is
 * not rendered, and Escape and outside-pointer events are cancelled before Radix
 * acts on them. The dialog is still announced as modal; it simply has no way out
 * but the action it asks for.
 *
 * Content sits inside Overlay so a dialog taller than the viewport scrolls the
 * scrim with it, rather than being clipped by a fixed, centred panel.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  subtitle,
  closeLabel,
}: ModalProps) {
  const returnFocus = useReturnFocus(open);

  /** Cancel the event when the dialog must not be escaped. */
  const block = (e: Event) => {
    if (!dismissible) e.preventDefault();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] grid place-items-center overflow-y-auto bg-[var(--overlay-scrim)] px-3 py-5">
          <Dialog.Content
            className="flex max-h-[88vh] w-full max-w-[420px] flex-col rounded-lg bg-surface shadow-lg outline-none"
            onEscapeKeyDown={block}
            onPointerDownOutside={block}
            onInteractOutside={block}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              returnFocus();
            }}
            aria-describedby={undefined}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2.5">
              <div>
                <Dialog.Title className="text-[15px] font-black text-primary">{title}</Dialog.Title>
                {subtitle ? (
                  <p className="mt-[3px] text-sm leading-normal text-fg-muted">{subtitle}</p>
                ) : null}
              </div>
              {dismissible ? (
                <Dialog.Close
                  className="cursor-pointer appearance-none border-0 bg-transparent p-1 text-[15px] leading-none text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
                  aria-label={closeLabel ?? 'Close'}
                >
                  ✕
                </Dialog.Close>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto px-4">{children}</div>
            {footer ? (
              <div className="flex gap-2 px-4 pt-3.5 pb-4 [&>*]:flex-1">{footer}</div>
            ) : null}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
