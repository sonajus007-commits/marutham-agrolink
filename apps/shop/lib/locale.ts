import type { Lang } from '@/lib/dict';

/* Language lives in the URL so a crawler can see it.
 *
 * A cookie alone (how the shop started) gave every page one address in two
 * languages — and Google crawls without cookies, so it only ever saw English and
 * the Tamil copy could never rank. Now English is the bare path and Tamil is the
 * same path under /ta, each page names both versions (hreflang), and the sitemap
 * lists both. middleware.ts maps /ta/* onto the same page files.
 *
 * Pure and client-safe: the toggle and the mobile nav use these too. */

export const TA_PREFIX = '/ta';

/** Request header middleware.ts sets to the URL's language; getLang() reads it. */
export const LANG_HEADER = 'x-ma-lang';

/** True for /ta and anything under /ta/. */
export function isTaPath(pathname: string): boolean {
  return pathname === TA_PREFIX || pathname.startsWith(`${TA_PREFIX}/`);
}

/** The path without any /ta prefix ("/ta" → "/", "/ta/about" → "/about"). */
export function stripLocale(pathname: string): string {
  return isTaPath(pathname) ? pathname.slice(TA_PREFIX.length) || '/' : pathname;
}

/** A site path in the given language ("/about", "ta" → "/ta/about"). */
export function localePath(lang: Lang, path: string): string {
  if (lang !== 'ta') return path;
  return path === '/' ? TA_PREFIX : `${TA_PREFIX}${path}`;
}

/** Metadata `alternates` for a page: its canonical in THIS language plus the
 *  hreflang pair. x-default is English, the language of a visitor we know
 *  nothing about. `path` is the English path, query string included. */
export function langAlternates(path: string, lang: Lang) {
  return {
    canonical: localePath(lang, path),
    languages: {
      'en-IN': path,
      'ta-IN': localePath('ta', path),
      'x-default': path,
    },
  };
}

/** Open Graph locale for the language. */
export function ogLocale(lang: Lang): string {
  return lang === 'ta' ? 'ta_IN' : 'en_IN';
}
