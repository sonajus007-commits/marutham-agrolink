import { cookies } from 'next/headers';
import { HOME_PRODUCT_LIMIT, type Product } from '@marutham/lib';
import { getAvailableProducts, getPublicStats } from '@/lib/api';
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
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

export default async function HomePage() {
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
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
        <Trust t={t} />
        <FreshToday t={t} products={shown} hasMore={products.length > HOME_PRODUCT_LIMIT} />
        <Categories t={t} products={products} />
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
          <a
            href="#shop"
            className="rounded-full bg-primary px-7 py-3 text-sm font-bold text-primary-on no-underline hover:bg-primary-hover"
          >
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

/* The mockup's trust strip. Every claim here is something the platform provably
 * does — the reference design's "Secure Payments · 100% Safe" is not among them,
 * because that is a promise about someone else's payment rail, not a feature we
 * can point at. "UPI & Cash on Delivery" is the same reassurance, and true. */
function Trust({ t }: { t: Dict }) {
  const items = [
    { icon: '🌱', title: t.trust.directTitle, sub: t.trust.directSub },
    { icon: '☀️', title: t.trust.freshTitle, sub: t.trust.freshSub },
    { icon: '⚖️', title: t.trust.priceTitle, sub: t.trust.priceSub },
    { icon: '₹', title: t.trust.payTitle, sub: t.trust.paySub },
    { icon: '🚚', title: t.trust.deliverTitle, sub: t.trust.deliverSub },
  ];
  return (
    <section className="border-y border-border bg-surface">
      <ul className="mx-auto grid max-w-6xl list-none grid-cols-2 gap-px overflow-hidden p-0 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <li key={it.title} className="flex flex-col items-center gap-1 px-4 py-7 text-center">
            <span aria-hidden="true" className="text-2xl leading-none">
              {it.icon}
            </span>
            <span className="mt-1 text-sm font-bold text-forest">{it.title}</span>
            <span className="text-xs text-fg-muted">{it.sub}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* Shop by Category, derived from the catalogue rather than hard-coded.
 *
 * The mockup names six tidy tiles (Vegetables, Fruits, Grains, Dairy, Groceries,
 * Meat & Fish). The real `category` column has ten values and they are messier
 * than that — "Grains, Rice & Pasta", "Yogurt & Eggs", "Canned & Packaged Goods"
 * — plus some products carry none at all. Hard-coding the mockup's six would
 * quietly hide whatever does not match, so the tiles are whatever the growers
 * are actually listing in. Fix the taxonomy in the data and this follows. */
function Categories({ t, products }: { t: Dict; products: Product[] }) {
  const counts = new Map<string, number>();
  for (const p of products) {
    const c = p.category?.trim();
    if (c) counts.set(c, (counts.get(c) || 0) + 1);
  }
  const cats = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (cats.length === 0) return null;

  return (
    <section id="categories" className="bg-muted px-5 py-16">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-display text-3xl font-bold text-forest">{t.categories.title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{t.categories.sub}</p>
        <ul className="mt-8 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3 lg:grid-cols-6">
          {cats.map(([name, n]) => (
            <li key={name}>
              <a
                href={`/products?category=${encodeURIComponent(name)}`}
                className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-3 py-6 text-center no-underline hover:border-forest hover:shadow-md"
              >
                <span aria-hidden="true" className="text-3xl leading-none">
                  {categoryEmoji(name)}
                </span>
                <span className="text-sm font-bold text-forest">{name}</span>
                <span className="text-xs text-fg-muted">{t.categories.count(n)}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* A category is free text from the admin catalogue, so this matches on what the
 * value contains rather than switching on an enum that does not exist. */
function categoryEmoji(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('veg')) return '🥦';
  if (c.includes('fruit')) return '🍎';
  if (c.includes('grain') || c.includes('rice') || c.includes('pasta')) return '🌾';
  if (c.includes('milk') || c.includes('cream') || c.includes('yogurt') || c.includes('egg'))
    return '🥛';
  if (c.includes('seafood') || c.includes('fish')) return '🐟';
  if (c.includes('poultry')) return '🍗';
  if (c.includes('meat')) return '🥩';
  if (c.includes('canned') || c.includes('packaged')) return '🥫';
  return '🧺';
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

function Achievements({
  t,
  stats,
}: {
  t: Dict;
  stats: Awaited<ReturnType<typeof getPublicStats>>;
}) {
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
            <div className="font-display text-4xl font-bold text-gold">
              {tile.value.toLocaleString('en-IN')}
            </div>
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
        <blockquote className="mt-3 text-base leading-relaxed text-fg-muted">
          {t.founder.body}
        </blockquote>
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
