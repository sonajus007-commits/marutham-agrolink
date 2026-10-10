'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import * as Sentry from '@sentry/nextjs';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { isTaPath } from '@/lib/locale';

/* A page that threw while rendering — almost always the API being unreachable,
 * since lib/api.ts throws on an outage rather than pretending a product is gone
 * (that is not-found.tsx's job). Next still answers with a 5xx, which a crawler
 * reads as "come back later"; this is what a person sees instead of a blank page.
 *
 * An error boundary must be a Client Component, so the language comes from the
 * URL (/ta) or the cookie in the browser rather than next/headers. */
function cookieLang(): Lang {
  if (isTaPath(window.location.pathname)) return 'ta';
  const m = document.cookie.match(new RegExp(`(?:^|; )${LANG_COOKIE}=([^;]*)`));
  const v = m ? decodeURIComponent(m[1]) : null;
  return isLang(v) ? v : DEFAULT_LANG;
}

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => setLang(cookieLang()), []);
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  const t = DICT[lang].status;

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-5 py-28 text-center">
      <div className="text-7xl" aria-hidden="true">
        🌧️
      </div>
      <h1 className="mt-6 font-display text-3xl font-bold text-forest">{t.errorTitle}</h1>
      <p className="mt-2 text-sm text-fg-muted">{t.errorSub}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-full border-0 bg-primary px-7 py-3 text-sm font-bold text-primary-on hover:bg-primary-hover"
        >
          {t.retry}
        </button>
        <Link
          href="/"
          className="rounded-full border border-forest px-7 py-3 text-sm font-bold text-forest no-underline"
        >
          {t.home}
        </Link>
      </div>
    </main>
  );
}
