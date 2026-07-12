import { cookies } from 'next/headers';
import { HOME_PRODUCT_LIMIT, type Product } from '@marutham/lib';
import { getAvailableProducts, getPublicStats, REVALIDATE_SECONDS } from '@/lib/api';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Dict, type Lang } from '@/lib/dict';
import { PORTAL_REGISTER } from '@/lib/portal';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ProductCard } from '@/components/ProductCard';

/* The public marketplace homepage — a Server Component.
 *
 * Everything a crawler needs arrives as HTML: today's produce, their prices, the
 * founder's message. The legacy page fetched products in the browser, so a bot
 * saw "Loading fresh products…" and nothing else — the catalogue has never been
 * indexable. Only two client components exist, and both are there because they
 * touch the browser: the language toggle (writes a cookie) and the order button
 * (writes localStorage). */
export const revalidate = REVALIDATE_SECONDS;

export default async function HomePage() {
  const cookieLang = cookies().get(LANG_COOKIE)?.value;
  const lang: Lang = isLang(cookieLang) ? cookieLang : DEFAULT_LANG;
  const t = DICT[lang];

  // One round trip each, in parallel; both degrade to empty rather than throw.
  const [products, stats] = await Promise.all([getAvailableProducts(), getPublicStats()]);
  const shown = products.slice(0, HOME_PRODUCT_LIMIT);

  return (
    <>
      <SiteHeader t={t} lang={lang} />

      <main>
        <Hero t={t} />
        <FreshToday t={t} products={shown} hasMore={products.length > HOME_PRODUCT_LIMIT} />
        <Achievements t={t} stats={stats} />
        <Founder t={t} />
        <Stories t={t} />
      </main>

      <SiteFooter t={t} />
    </>
  );
}

function Hero({ t }: { t: Dict }) {
  return (
    <section className="bg-gradient-to-b from-muted to-surface px-5 py-16 text-center sm:py-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-4xl leading-tight font-bold text-forest sm:text-6xl">
          {t.hero.titleA}
          <br />
          <span className="text-leaf">{t.hero.titleB}</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base text-fg-muted sm:text-lg">{t.hero.sub}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="#shop" className="rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-on no-underline hover:bg-primary-hover">
            {t.hero.ctaShop}
          </a>
          <a
            href={PORTAL_REGISTER}
            className="rounded-full border-2 border-forest px-7 py-3 text-sm font-bold text-forest no-underline hover:bg-forest hover:text-white"
          >
            {t.hero.ctaSell}
          </a>
        </div>
      </div>
    </section>
  );
}

function FreshToday({ t, products, hasMore }: { t: Dict; products: Product[]; hasMore: boolean }) {
  return (
    <section id="shop" className="mx-auto max-w-6xl px-5 py-16">
      <h2 className="font-display text-3xl font-bold text-forest">{t.fresh.title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t.fresh.sub}</p>

      {products.length === 0 ? (
        <p className="py-16 text-center text-fg-muted">{t.fresh.empty}</p>
      ) : (
        <ul className="mt-8 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-5">
          {products.map((p) => (
            <ProductCard key={p.id} t={t} product={p} />
          ))}
        </ul>
      )}

      {hasMore ? (
        <div className="mt-8 text-center">
          {/* Was PORTAL_LOGIN — "View all products" put an anonymous visitor at a
              sign-in wall, on the one page whose job is to let them browse
              without an account. It goes to the catalogue now. */}
          <a
            href="/products"
            className="inline-block rounded-full bg-muted px-8 py-3 text-sm font-bold text-forest no-underline hover:bg-primary hover:text-primary-on"
          >
            {t.fresh.viewAll}
          </a>
        </div>
      ) : null}
    </section>
  );
}

function Achievements({ t, stats }: { t: Dict; stats: Awaited<ReturnType<typeof getPublicStats>> }) {
  const tiles = [
    { value: stats.activeSellers, label: t.stats.sellers },
    { value: stats.happyCustomers, label: t.stats.customers },
    { value: stats.activeDistricts, label: t.stats.districts },
    { value: stats.activeStates, label: t.stats.states },
  ];
  return (
    <section className="bg-forest-deep px-5 py-14 text-white">
      <ul className="mx-auto grid max-w-5xl list-none grid-cols-2 gap-8 p-0 text-center sm:grid-cols-4">
        {tiles.map((tile) => (
          <li key={tile.label}>
            <div className="font-display text-4xl font-bold text-gold">{tile.value.toLocaleString('en-IN')}</div>
            <div className="mt-1 text-xs font-semibold opacity-80">{tile.label}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Founder({ t }: { t: Dict }) {
  return (
    <section id="about" className="mx-auto max-w-4xl px-5 py-16">
      <h2 className="font-display text-3xl font-bold text-forest">{t.founder.title}</h2>
      <figure className="mt-6 rounded-2xl border border-border bg-muted p-8">
        <h3 className="text-lg font-bold text-forest">{t.founder.heading}</h3>
        <blockquote className="mt-3 text-base leading-relaxed text-fg-muted">{t.founder.body}</blockquote>
        <figcaption className="mt-4 text-xs font-bold text-forest">{t.founder.role}</figcaption>
      </figure>
    </section>
  );
}

function Stories({ t }: { t: Dict }) {
  return (
    <section id="stories" className="mx-auto max-w-6xl px-5 pb-20">
      <h2 className="font-display text-3xl font-bold text-forest">{t.stories.title}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t.stories.sub}</p>
      <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center text-sm text-fg-muted">
        {/* Stories are editorial content with no endpoint behind them yet; the
            section is kept so the nav anchor and the page's shape survive the
            port, and it fills when there is a source. */}
        🌾
      </div>
    </section>
  );
}
