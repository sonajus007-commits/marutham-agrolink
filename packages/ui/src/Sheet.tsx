import type { ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useReturnFocus } from './lib/useReturnFocus';

export interface SheetProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Full-screen mobile overlay ("action sheet").
 *
 * Radix Dialog supplies the focus trap, focus restoration, background scroll
 * lock, Escape handling and the `inert` treatment of everything behind it. It
 * also keeps nesting honest: a <Modal> opened from inside a Sheet takes the top
 * of the dismissable-layer stack, so Escape closes the Modal and leaves the
 * Sheet standing. That was the whole job of the hand-rolled escape stack this
 * replaces.
 *
 * The Overlay is invisible and is not decoration. Radix puts its background
 * scroll lock (react-remove-scroll) inside Dialog.Overlay, not Dialog.Content —
 * omit it and the page behind a full-screen sheet scrolls under your thumb.
 * The sheet covers it entirely, so it paints nothing.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const returnFocus = useReturnFocus(open);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-sheet)]" />
        <Dialog.Content
          className="fixed inset-0 z-[var(--z-sheet)] flex flex-col overflow-y-auto bg-bg focus:outline-none"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            returnFocus();
          }}
          // Radix warns when a dialog has no description. This one is labelled
          // by its title and its body is the description.
          aria-describedby={undefined}
        >
          <div className="sticky top-0 z-[var(--z-sticky)] flex items-center gap-3 bg-[linear-gradient(135deg,var(--forest),var(--forest-soft))] px-4 py-3.5">
            <Dialog.Close
              className="size-9 shrink-0 cursor-pointer appearance-none rounded-md border-0 bg-white/15 text-[18px] text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              aria-label="Back"
            >
              ←
            </Dialog.Close>
            <Dialog.Title className="text-xl font-bold text-white">{title}</Dialog.Title>
          </div>
          <div className="flex-1 p-4.5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
