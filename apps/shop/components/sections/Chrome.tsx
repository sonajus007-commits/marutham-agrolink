import { MapPin, Search } from 'lucide-react';
import { MaruthamLogo } from '@/components/brand/MaruthamLogo';
import { LangToggle } from '@/components/LangToggle';
import { LoginButton } from '@/components/auth/LoginButton';
import { CartLink } from '@/components/CartLink';
import type { Dict, Lang } from '@/lib/dict';
import type { LandingCopy } from '@/lib/landing';

/* A search field, as a plain GET form so it needs no client JS and works from a
 * Server Component: submitting navigates to /products?q=… The catalogue is the
 * honest destination today; the query wiring lands with the P3 search endpoint.
 * `role="search"` + a labelled input keep it accessible. */
function SearchForm({ t, className = '' }: { t: Dict; className?: string }) {
  return (
    <form action="/products" role="search" className={`min-w-0 ${className}`}>
      <label className="border-border bg-bg focus-within:border-forest-500 flex items-center gap-2.5 rounded-full border px-4 py-2.5 transition-colors">
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
    { href: '/#farmers', label: t.nav.farmers },
    { href: '/#how-it-works', label: t.nav.how },
  ];

  return (
    <header className="border-border bg-surface/85 sticky top-0 z-50 border-b backdrop-blur-md">
      {/* min-w-0 on the row and shrink on the brand: the Tamil sign-in label is
          longer than the English one and pushed the header past 390px. */}
      <div className="mx-auto flex w-full max-w-[1440px] min-w-0 items-center gap-3 px-6 py-3.5 md:gap-5 md:px-10">
        {/* shrink-0, not shrink: a squeezed box does not squeeze the text inside
            it, so the wordmark painted over the toggle. It drops to the mark
            alone below sm instead. */}
        <a href="/" className="shrink-0 no-underline" aria-label="Marutham AgroLink">
          <MaruthamLogo compact />
        </a>

        {/* Service area. Marutham serves Pudukkottai today, so this states a fact
            rather than asking for a location it cannot yet act on. Hidden on the
            tightest widths where the search + controls need the room. */}
        <span className="text-fg-muted hidden shrink-0 items-center gap-1.5 text-caption font-medium xl:inline-flex">
          <MapPin className="text-blossom-ink h-4 w-4 shrink-0" aria-hidden="true" />
          {t.nav.location}
        </span>

        {/* Search takes the middle on md+; on small screens it drops to its own
            full-width row below (the reference model's mobile layout). */}
        <SearchForm t={t} className="hidden flex-1 md:block" />

        <nav aria-label="Primary" className="hidden shrink-0 lg:block">
          <ul className="flex list-none items-center gap-6 p-0">
            {NAV.map((n) => (
              <li key={n.href}>
                <a
                  href={n.href}
                  className="text-fg-muted hover:text-forest-700 text-caption font-medium no-underline transition-colors"
                >
                  {n.label}
                </a>
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

      {/* Mobile search row — full width, below the brand bar. */}
      <div className="border-border/60 border-t px-6 py-2.5 md:hidden">
        <SearchForm t={t} />
      </div>
    </header>
  );
}

export function SiteFooter({ t, c }: { t: Dict; c: LandingCopy }) {
  const L = c.footer.links;
  /* Hrefs point only at destinations that still exist after the home page was
     trimmed to the model: the catalogue, the three homepage sections, and the
     portal register route. Labels are unchanged. */
  const cols = [
    {
      h: c.footer.marketplace,
      links: [
        { href: '/products', l: L.all },
        { href: '/#categories', l: L.how },
        { href: '/#how-it-works', l: L.pricing },
      ],
    },
    {
      h: c.footer.farmers,
      links: [
        { href: '/#farmers', l: L.selling },
        { href: '/app/register', l: L.business },
        { href: '/#how-it-works', l: L.questions },
      ],
    },
    {
      h: c.footer.company,
      links: [
        { href: '/#how-it-works', l: L.why },
        { href: '/#farmers', l: L.sustainability },
        { href: '/products', l: L.contact },
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
              {/* gold as a small heading would be 2.19:1 on light, but this
                  ground is forest-900 — gold on it clears AA comfortably. */}
              <h3 className="text-gold-500 text-[0.7rem] font-semibold tracking-[0.14em] uppercase">
                {c.h}
              </h3>
              <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
                {c.links.map((l) => (
                  <li key={l.l}>
                    <a
                      href={l.href}
                      className="text-leaf-300 hover:text-surface text-caption no-underline transition-colors"
                    >
                      {l.l}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-forest-500/30 text-leaf-300 mt-12 border-t pt-6 text-[0.75rem]">
          © {new Date().getFullYear()} {t.footer.rights}
        </div>
      </div>
    </footer>
  );
}
