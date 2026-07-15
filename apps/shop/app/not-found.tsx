import { cookies } from 'next/headers';
import Link from 'next/link';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';

/* Served for a product id that does not exist — and ONLY for that.
 *
 * A dead backend must never land here: lib/api.ts throws instead of returning
 * null, so an outage renders a 5xx. The difference matters to a crawler, which
 * reads a 404 as "drop this URL" and a 5xx as "come back later". */
export default async function NotFound() {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  const l: Lang = isLang(c) ? c : DEFAULT_LANG;
  const t = DICT[l];

  return (
    <>
      <SiteHeader t={t} lang={l} />

      <main className="mx-auto flex max-w-2xl flex-col items-center px-5 py-28 text-center">
        <div className="text-7xl" aria-hidden="true">
          🌾
        </div>
        <h1 className="mt-6 font-display text-3xl font-bold text-forest">{t.product.notFound}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t.product.notFoundSub}</p>
        <Link
          href="/products"
          className="mt-8 rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-on no-underline hover:bg-primary-hover"
        >
          {t.product.back}
        </Link>
      </main>

      <SiteFooter t={t} />
    </>
  );
}
