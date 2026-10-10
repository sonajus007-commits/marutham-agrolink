import { NextResponse, type NextRequest } from 'next/server';
import { LANG_COOKIE } from '@/lib/dict';
import { LANG_HEADER, isTaPath, stripLocale, TA_PREFIX } from '@/lib/locale';

/* URL → language, for every public page (see lib/locale.ts).
 *
 *   /ta/...  rewritten onto the same page file, rendered in Tamil; the cookie is
 *            set so the visitor's later clicks stay in Tamil.
 *   /...     English. A visitor whose cookie says Tamil (they chose it here or in
 *            the portal) is redirected to the /ta address instead, so one URL
 *            always shows one language. Google sends no cookie, so it never
 *            sees that redirect and always reads English at the bare path. */
const YEAR = 60 * 60 * 24 * 365;

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (isTaPath(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = stripLocale(pathname);
    const headers = new Headers(req.headers);
    headers.set(LANG_HEADER, 'ta');
    const res = NextResponse.rewrite(url, { request: { headers } });
    if (req.cookies.get(LANG_COOKIE)?.value !== 'ta') {
      res.cookies.set(LANG_COOKIE, 'ta', { path: '/', maxAge: YEAR, sameSite: 'lax' });
    }
    return res;
  }

  if (req.cookies.get(LANG_COOKIE)?.value === 'ta') {
    const url = req.nextUrl.clone();
    url.pathname = pathname === '/' ? TA_PREFIX : `${TA_PREFIX}${pathname}`;
    url.search = search;
    return NextResponse.redirect(url, 307);
  }

  const headers = new Headers(req.headers);
  headers.set(LANG_HEADER, 'en');
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Pages only: not Next internals, the API or the portal (proxied elsewhere),
  // generated SEO files, or anything with a file extension (images, sw.js,
  // sitemap.xml, robots.txt, the manifest).
  matcher: ['/((?!_next/|api/|app/|opengraph-image|.*\\..*).*)'],
};
