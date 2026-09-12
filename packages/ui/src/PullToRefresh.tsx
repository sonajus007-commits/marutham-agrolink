import { useRef, useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './lib/cn';

/* Pull-to-refresh for a mobile list. Wraps a scroll area; when the user drags
 * down from the very top past a threshold and releases, `onRefresh` runs and a
 * spinner shows until its promise settles. Touch-only — it never interferes with
 * a mouse/desktop, and it only engages when the content is already scrolled to
 * the top, so normal scrolling is untouched.
 *
 * Respects reduced-motion by keeping the pull indicator static (no spin) via the
 * `motion-reduce` utility. The refresh still runs; only the flourish is dropped. */

const THRESHOLD = 64; // px pulled before a release triggers a refresh
const MAX = 96; // px the indicator travels at most (dampened past threshold)

export interface PullToRefreshProps {
  onRefresh: () => void | Promise<unknown>;
  children: ReactNode;
  className?: string;
}

export function PullToRefresh({ onRefresh, children, className }: PullToRefreshProps) {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);

  const onStart = (e: React.TouchEvent) => {
    if (busy) return;
    const el = ref.current;
    if (el && el.scrollTop <= 0) startY.current = e.touches[0].clientY;
    else startY.current = null;
  };
  const onMove = (e: React.TouchEvent) => {
    if (startY.current == null || busy) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0) {
      setPull(0);
      return;
    }
    // Dampen the drag so it feels elastic rather than 1:1.
    setPull(Math.min(MAX, dy * 0.5));
  };
  const onEnd = async () => {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= THRESHOLD && !busy) {
      setBusy(true);
      setPull(THRESHOLD);
      try {
        await onRefresh();
      } finally {
        setBusy(false);
        setPull(0);
      }
    } else {
      setPull(0);
    }
  };

  const active = pull > 0 || busy;

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <div
        aria-hidden={!active}
        className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center"
        style={{ height: pull, opacity: active ? 1 : 0 }}
      >
        <Loader2
          className={cn(
            'h-6 w-6 text-forest',
            busy ? 'animate-spin motion-reduce:animate-none' : '',
          )}
          style={!busy ? { transform: `rotate(${pull * 3}deg)` } : undefined}
        />
      </div>
      <div
        ref={ref}
        className="h-full overflow-y-auto overscroll-contain"
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: startY.current == null ? 'transform 0.2s var(--ease-standard)' : undefined,
        }}
        onTouchStart={onStart}
        onTouchMove={onMove}
        onTouchEnd={onEnd}
      >
        {children}
      </div>
    </div>
  );
}
