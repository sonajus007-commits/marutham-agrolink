import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { cn } from './lib/cn';

/* Transient feedback — the snackbar a screen shows after an action ("Marked
 * packed", "3 updates queued, will sync"). Wrap the app (or a role subtree) in
 * <ToastProvider> once; anywhere inside, `const toast = useToast()` then
 * `toast.show({ tone: 'success', message: '…' })`.
 *
 * Toasts stack bottom-centre above the bottom nav, auto-dismiss after a few
 * seconds (persist by passing `duration: 0`), and can be dismissed by tapping the
 * close affordance. `role="status"`/`aria-live="polite"` announces them without
 * stealing focus. Tone carries an icon so the meaning isn't colour-only. */

export type ToastTone = 'success' | 'danger' | 'info' | 'warning';

export interface ToastOptions {
  message: ReactNode;
  tone?: ToastTone;
  /** ms before auto-dismiss; 0 keeps it until dismissed. Default 3500. */
  duration?: number;
}

interface ToastItem extends Required<Omit<ToastOptions, 'duration'>> {
  id: number;
  duration: number;
}

interface ToastApi {
  show: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const TONE_ICON = {
  success: CheckCircle2,
  danger: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

const TONE_ACCENT: Record<ToastTone, string> = {
  success: 'text-success',
  danger: 'text-danger',
  info: 'text-info',
  warning: 'text-warning-strong',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => {
    setItems((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (opts: ToastOptions) => {
      const id = ++seq.current;
      const item: ToastItem = {
        id,
        message: opts.message,
        tone: opts.tone ?? 'info',
        duration: opts.duration ?? 3500,
      };
      setItems((list) => [...list, item]);
      if (item.duration > 0) {
        setTimeout(() => dismiss(id), item.duration);
      }
      return id;
    },
    [dismiss],
  );

  return (
    <ToastCtx.Provider value={{ show, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem_+_env(safe-area-inset-bottom))] z-[var(--z-toast)] flex flex-col items-center gap-2 px-4">
        {items.map((t) => {
          const Icon = TONE_ICON[t.tone];
          return (
            <div
              key={t.id}
              role="status"
              aria-live="polite"
              className="pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-md border border-surface-muted bg-surface px-3.5 py-3 shadow-base"
            >
              <Icon aria-hidden="true" className={cn('h-5 w-5 shrink-0', TONE_ACCENT[t.tone])} />
              <span className="min-w-0 flex-1 font-sans text-sm font-semibold text-fg">
                {t.message}
              </span>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-fg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
