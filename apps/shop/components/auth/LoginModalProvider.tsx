'use client';

/* Holds the sign-in overlay's open state for the whole page so any trigger — the
 * header "Sign in", a product's order button, a footer link — opens the SAME
 * modal on top of the home page, and closing returns to the same URL. Mounted
 * once in the root layout; the modal itself renders here, not at each trigger. */

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { Lang } from '@/lib/dict';
import { LoginModal } from './LoginModal';

interface LoginModalApi {
  openLogin: () => void;
  closeLogin: () => void;
}

const Ctx = createContext<LoginModalApi | null>(null);

export function LoginModalProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openLogin = useCallback(() => setOpen(true), []);
  const closeLogin = useCallback(() => setOpen(false), []);
  return (
    <Ctx.Provider value={{ openLogin, closeLogin }}>
      {children}
      {open ? <LoginModal lang={lang} onClose={closeLogin} /> : null}
    </Ctx.Provider>
  );
}

/** null-safe: a trigger rendered outside the provider just navigates instead. */
export function useLoginModal(): LoginModalApi | null {
  return useContext(Ctx);
}
