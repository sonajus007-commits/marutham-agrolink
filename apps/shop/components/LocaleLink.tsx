'use client';

/* Links that stay in the page's language.
 *
 * A Tamil page that links to "/products" sends a crawler (no cookie) to the
 * English page, and costs a visitor a redirect through proxy.ts. So every
 * in-site link goes through here: on a /ta page it points at the /ta twin.
 *
 * The language comes from the root layout (which read it from the URL via
 * proxy.ts), not from usePathname — the server render is what a crawler
 * reads, and it must already carry the /ta hrefs. */

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { DEFAULT_LANG, type Lang } from '@/lib/dict';
import { localeHref } from '@/lib/locale';

const LangContext = createContext<Lang>(DEFAULT_LANG);

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** The page's language, for Client Components. */
export function usePageLang(): Lang {
  return useContext(LangContext);
}

/** next/link with the href put into the page's language. String hrefs only. */
export function LocaleLink({ href, ...rest }: ComponentProps<typeof Link> & { href: string }) {
  return <Link href={localeHref(usePageLang(), href)} {...rest} />;
}

/** A plain <a> (full page load) with the href put into the page's language. */
export function LocaleA({ href, ...rest }: ComponentProps<'a'> & { href: string }) {
  return <a href={localeHref(usePageLang(), href)} {...rest} />;
}
