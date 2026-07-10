import { useLayoutEffect, useRef } from 'react';

/**
 * Remember what had focus before a dialog opened, so it can be handed back.
 *
 * Radix returns focus to `Dialog.Trigger` on close. Every dialog here is
 * controlled by an `open` prop instead — the caller owns the state, and there is
 * no Trigger to return to, so Radix hands focus to <body> and the keyboard user
 * loses their place. This captures the element itself.
 *
 * `useLayoutEffect`, not `useEffect`: Radix's FocusScope moves focus into the
 * dialog in a passive effect, which runs after every layout effect. Reading
 * `document.activeElement` here still sees the trigger.
 */
export function useReturnFocus(open: boolean): () => void {
  const previous = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (open) previous.current = document.activeElement as HTMLElement | null;
  }, [open]);

  return () => previous.current?.focus?.();
}
