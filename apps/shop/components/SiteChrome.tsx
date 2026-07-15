import { PORTAL_LOGIN } from '@/lib/portal';
import { LangToggle } from '@/components/LangToggle';
import type { Dict, Lang } from '@/lib/dict';

/* The header and footer every public page wears.
 *
 * Server Components — they hold no state and touch no browser API, so they cost
 * a visitor nothing. The only client island in here is the language toggle,
 * which writes a cookie.
 *
 * The section links are ROOT-RELATIVE ("/#shop", not "#shop"): a bare hash on
 * /products/tomatoes scrolls to an anchor that does not exist on that page, and
 * the nav silently does nothing. They must always land on the homepage section.
 */
export function SiteHeader({ t, lang }: { t: Dict; lang: Lang }) {
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3">
        <a href="/" className="font-display text-xl font-bold text-forest no-underline">
          Marutham <span className="text-leaf">AgroLink</span>
        </a>
        <nav className="ml-auto hidden items-center gap-6 sm:flex">
          <a
            href="/products"
            className="text-sm font-semibold text-fg-muted no-underline hover:text-forest"
          >
            {t.nav.shop}
          </a>
          <a
            href="/#about"
            className="text-sm font-semibold text-fg-muted no-underline hover:text-forest"
          >
            {t.nav.about}
          </a>
          <a
            href="/#stories"
            className="text-sm font-semibold text-fg-muted no-underline hover:text-forest"
          >
            {t.nav.stories}
          </a>
        </nav>
        <LangToggle current={lang} />
        <a
          href={PORTAL_LOGIN}
          className="rounded-full bg-forest px-4 py-2 text-sm font-bold text-white no-underline hover:bg-forest-deep"
        >
          {t.nav.login}
        </a>
      </div>
    </header>
  );
}

export function SiteFooter({ t }: { t: Dict }) {
  return (
    <footer className="border-t border-border bg-muted px-5 py-10">
      <div className="mx-auto max-w-6xl text-center">
        <p className="font-display text-lg font-bold text-forest">Marutham AgroLink</p>
        <p className="mt-1 text-xs text-fg-muted">{t.footer.tagline}</p>
        <p className="mt-4 text-xs text-fg-muted">
          © {new Date().getFullYear()} {t.footer.rights}
        </p>
      </div>
    </footer>
  );
}
