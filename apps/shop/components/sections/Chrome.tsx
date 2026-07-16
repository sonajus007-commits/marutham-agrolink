import { MaruthamLogo } from '@/components/brand/MaruthamLogo';
import { Button } from '@/components/ui/Button';
import { LangToggle } from '@/components/LangToggle';
import { PORTAL_LOGIN } from '@/lib/portal';
import type { Dict, Lang } from '@/lib/dict';

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
  const NAV = [
    { href: '/products', label: t.nav.shop },
    { href: '/#why', label: t.nav.why },
    { href: '/#farmers', label: t.nav.farmers },
    { href: '/#faq', label: t.nav.faq },
    { href: '/#contact', label: t.nav.contact },
  ];

  return (
    <header className="border-border bg-surface/85 sticky top-0 z-50 border-b backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1440px] items-center gap-6 px-6 py-3.5 md:px-10">
        <a href="/" className="no-underline" aria-label="Marutham AgroLink">
          <MaruthamLogo />
        </a>

        <nav aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex list-none items-center gap-8 p-0">
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

        <div className="ml-auto flex items-center gap-3 lg:ml-0">
          <LangToggle current={lang} />
          <Button href={PORTAL_LOGIN} variant="primary" className="px-6 py-2.5 text-caption">
            {t.nav.login}
          </Button>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ t }: { t: Dict }) {
  const cols = [
    {
      h: 'Marketplace',
      links: [
        { href: '/products', l: 'All produce' },
        { href: '/#marketplace', l: 'How the market works' },
        { href: '/#pricing', l: 'Pricing' },
      ],
    },
    {
      h: 'For farmers',
      links: [
        { href: '/#farmers', l: 'Selling with us' },
        { href: '/#business', l: 'For businesses' },
        { href: '/#faq', l: 'Questions' },
      ],
    },
    {
      h: 'Company',
      links: [
        { href: '/#why', l: 'Why Marutham' },
        { href: '/#sustainability', l: 'Sustainability' },
        { href: '/#contact', l: 'Contact' },
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
