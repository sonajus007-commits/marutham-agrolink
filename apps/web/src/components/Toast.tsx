import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastType = 'ok' | 'er' | 'nfo';
interface ToastState { msg: string; type: ToastType }

const ToastContext = createContext<(msg: string, type?: ToastType) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((msg: string, type: ToastType = 'ok') => {
    setToast({ msg, type });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <div className={`toast toast--${toast.type}`} role="status" aria-live="polite">
          {toast.msg}
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
