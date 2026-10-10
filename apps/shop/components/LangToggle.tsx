'use client';

import { LANG_COOKIE, type Lang } from '@/lib/dict';
import { localePath, stripLocale } from '@/lib/locale';

/* Language is part of the URL (/ta/... is Tamil, the bare path English — see
 * lib/locale.ts), so switching language means going to the other address. The
 * cookie is written FIRST: middleware sends a Tamil-cookie visitor on a bare path
 * to /ta, so switching to English must clear that before the navigation lands.
 * A full load, not router.push, so no cached render of the old language is reused.
 *
 * `ma_lang` is the same key the portal uses, so a visitor who chooses Tamil here
 * stays in Tamil after they sign in. */
export function LangToggle({ current }: { current: Lang }) {
  function pick(lang: Lang) {
    if (lang === current) return;
    // 1 year, site-wide.
    document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=${60 * 60 * 24 * 365}`;
    const { pathname, search, hash } = window.location;
    window.location.assign(localePath(lang, stripLocale(pathname)) + search + hash);
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
      {(['en', 'ta'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => pick(lang)}
          aria-pressed={current === lang}
          className={`cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-bold transition-colors ${
            current === lang
              ? 'bg-forest text-white'
              : 'bg-transparent text-fg-muted hover:text-forest'
          } ${lang === 'ta' ? 'font-[Noto_Serif_Tamil]' : ''}`}
        >
          {lang === 'en' ? 'EN' : 'த'}
        </button>
      ))}
    </div>
  );
}
