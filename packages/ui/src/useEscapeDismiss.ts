import { useEffect, useRef } from 'react';

/* A single Escape handler shared by every overlay, so that nesting behaves.
 *
 * Each open overlay pushes itself onto a stack; Escape dismisses only the
 * topmost one. Without this, each overlay listening on `document` independently
 * means one Escape inside a <Modal> also closes the <Sheet> behind it. */

type Dismiss = () => void;
const stack: Dismiss[] = [];
let listening = false;

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || stack.length === 0) return;
  e.stopPropagation();
  stack[stack.length - 1]();
}

/** Dismiss on Escape, but only while this overlay is the topmost one open. */
export function useEscapeDismiss(active: boolean, onDismiss: Dismiss): void {
  const latest = useRef(onDismiss);
  useEffect(() => {
    latest.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return;
    if (!listening && typeof document !== 'undefined') {
      document.addEventListener('keydown', onKeyDown);
      listening = true;
    }
    const entry: Dismiss = () => latest.current();
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
