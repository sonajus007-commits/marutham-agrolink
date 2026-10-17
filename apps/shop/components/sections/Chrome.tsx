import { MapPin, Search } from 'lucide-react';
import { LocaleA } from '@/components/LocaleLink';
import { MaruthamLogo } from '@/components/brand/MaruthamLogo';
import { LangToggle } from '@/components/LangToggle';
import { LoginButton } from '@/components/auth/LoginButton';
import { CartLink } from '@/components/CartLink';
import type { Dict, Lang } from '@/lib/dict';
import { localeHref } from '@/lib/locale';
import type { LandingCopy } from '@/lib/landing';

/* A search field, as a plain GET form so it needs no client JS and works from a
 * Server Component: submitting navigates to /products?q=… The catalogue is the
 * honest destination today; the query wiring lands with the P3 search endpoint.
 * `role="search"` + a labelled input keep it accessible. */
function SearchForm({ t, lang, className = '' }: { t: Dict; lang: Lang; className?: string }) {
  return (
    <form action={localeHref(lang, '/products')} role="search" className={`min-w-0 ${className}`}>
      <label className="border-border bg-bg focus-within:border-forest-500 flex min-h-11 items-center gap-2.5 rounded-full border px-4 py-2.5 transition-colors">
        <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          type="search"
          name="q"
          placeholder={t.nav.search}
          aria-label={t.nav.search}
          className="text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-caption outline-none"
        />
      </label>
    </form>
  );
}

/* Header and footer.
 *
 * The nav names only sections that exist on this page or routes that exist in
 * the app. The reference comp's nav also lists "About Us", "How It Works" and
 * "Contact" as separate pages — About Us and Contact have no route at all, and
 * How It Works is what the two journey sections already are. Rather than ship
 * links that 404, they are anchors to the real sections.
 *
 * The section links are ROOT-RELATIVE ("/#why", not "#why"): a bare hash on
 * /products/tomatoes scrolls to an anchor that does not exist on that page, and
 * the nav silently does nothing. They must always land on the homepage section.
 *
 * The LangToggle is not optional. This is a Tamil Nadu business and the shop has
 * been bilingual since it shipped; :lang(ta) has its own face loaded. A redesign
 * that drops the toggle takes the site away from the people it is for. */

export function SiteHeader({ t, lang }: { t: Dict; lang: Lang }) {
  /* The nav names only what exists on the trimmed home page: the catalogue, and
     the three homepage sections (their ids: #categories, #farmers,
     #how-it-works). About Us / Offers from the model wait for their own pages. */
  const NAV = [
    { href: '/products', label: t.nav.shop },
    { href: '/#categories', label: t.nav.categories },
    { href: '/farmers', label: t.nav.farmers },
    { href: '/how-it-works', label: t.nav.how },
  ];

  return (
    <header className="border-border bg-surface/85 sticky top-0 z-50 border-b backdrop-blur-md">
      {/* min-w-0 on the row and shrink on the brand: the Tamil sign-in label is
          longer than the English one and pushed the header past 390px. */}
      <div className="mx-auto flex w-full max-w-[1440px] min-w-0 items-center gap-3 px-6 py-3.5 md:gap-5 md:px-10">
        {/* shrink-0, not shrink: a squeezed box does not squeeze the text inside
            it, so the wordmark painted over the toggle. It drops to the mark
            alone below sm instead. */}
        <LocaleA href="/" className="shrink-0 no-underline" aria-label="Marutham AgroLink">
          <MaruthamLogo compact />
        </LocaleA>

        {/* Service area. Marutham serves Pudukkottai today, so this states a fact
            rather than asking for a location it cannot yet act on. Hidden on the
            tightest widths where the search + controls need the room. */}
        <span className="text-fg-muted hidden shrink-0 items-center gap-1.5 text-caption font-medium xl:inline-flex">
          <MapPin className="text-blossom-ink h-4 w-4 shrink-0" aria-hidden="true" />
          {t.nav.location}
        </span>

        {/* Search takes the middle on md+; on small screens it drops to its own
            full-width row below (the reference model's mobile layout). */}
        <SearchForm t={t} lang={lang} className="hidden flex-1 md:block" />

        <nav aria-label="Primary" className="hidden shrink-0 lg:block">
          <ul className="flex list-none items-center gap-6 p-0">
            {NAV.map((n) => (
              <li key={n.href}>
                <LocaleA
                  href={n.href}
                  className="text-fg-muted hover:text-forest-700 inline-flex min-h-11 items-center text-caption font-medium no-underline transition-colors"
                >
                  {n.label}
                </LocaleA>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2.5 lg:ml-0">
          <LangToggle current={lang} />
          <CartLink label={t.nav.cart} />
          <LoginButton label={t.nav.login} />
        </div>
      </div>

      {/* Mobile search row — full width, below the brand bar — with the service
          area under it, since the desktop location chip has no room up top. A
          plain statement, not a picker: there is one service area today. */}
      <div className="border-border/60 border-t px-6 py-2.5 md:hidden">
        <SearchForm t={t} lang={lang} />
        <p className="text-fg-muted mt-1.5 flex items-center gap-1.5 text-meta font-medium">
          <MapPin className="text-blossom-ink h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t.nav.deliveringTo} {t.nav.location}
        </p>
      </div>
    </header>
  );
}

export function SiteFooter({ t, c }: { t: Dict; c: LandingCopy }) {
  const L = c.footer.links;
  /* Hrefs point at real destinations: the catalogue + categories, the static
     info pages (/how-it-works, /about, /contact) and the portal register route.
     Labels are unchanged. */
  const cols = [
    {
      h: c.footer.marketplace,
      links: [
        { href: '/products', l: L.all },
        { href: '/how-it-works', l: L.how },
        { href: '/#categories', l: L.pricing },
      ],
    },
    {
      h: c.footer.farmers,
      links: [
        { href: '/farmers', l: L.selling },
        { href: '/app/register', l: L.business },
        { href: '/how-it-works', l: L.questions },
      ],
    },
    {
      h: c.footer.company,
      links: [
        { href: '/about', l: L.why },
        { href: '/about', l: L.sustainability },
        { href: '/contact', l: L.contact },
      ],
    },
  ];

  return (
    <footer className="bg-forest-900 text-surface px-6 py-16 md:px-10">
      <div className="mx-auto w-full max-w-[1440px]">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-4">
            <MaruthamLogo tone="onDark" />
            <p className="text-leaf-300 max-w-[34ch] text-caption">{t.footer.tagline}</p>
          </div>

          {cols.map((c) => (
            <div key={c.h}>
              {/* Cream, not gold: the brand rule is that gold #D9A441 is never
                  text, even where it would pass contrast on forest-900. */}
              <h3 className="text-surface text-meta font-semibold tracking-[0.14em] uppercase">
                {c.h}
              </h3>
              <ul className="mt-2 flex list-none flex-col p-0">
                {c.links.map((l) => (
                  <li key={l.l}>
                    <LocaleA
                      href={l.href}
                      className="text-leaf-300 hover:text-surface inline-flex min-h-11 items-center text-caption no-underline transition-colors"
                    >
                      {l.l}
                    </LocaleA>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-forest-500/30 mt-12 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-leaf-300 text-meta">
            © {new Date().getFullYear()} {t.footer.rights}
          </p>
          <ul className="flex list-none flex-wrap gap-x-5 p-0 text-meta">
            {[
              { href: '/about', l: t.htmlLang === 'ta' ? 'எங்களைப் பற்றி' : 'About' },
              { href: '/contact', l: t.htmlLang === 'ta' ? 'தொடர்பு' : 'Contact' },
              { href: '/terms', l: t.htmlLang === 'ta' ? 'விதிமுறைகள்' : 'Terms' },
              { href: '/privacy', l: t.htmlLang === 'ta' ? 'தனியுரிமை' : 'Privacy' },
            ].map((x) => (
              <li key={x.href}>
                <LocaleA
                  href={x.href}
                  className="text-leaf-300 hover:text-surface inline-flex min-h-11 items-center no-underline"
                >
                  {x.l}
                </LocaleA>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
