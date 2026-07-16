import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getAllProducts } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { ProductCard } from '@/components/ProductCard';

/* The full catalogue — every product, browsable without an account.
 *
 * This is where "View All Products" goes. It used to go to the sign-in page,
 * which meant the public marketplace showed ten products and then asked for a
 * password, and a crawler could reach exactly one page. */
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

async function lang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = DICT[await lang()];
  return {
    title: t.catalogue.metaTitle,
    description: t.catalogue.metaDesc,
    alternates: { canonical: '/products' },
    openGraph: {
      title: t.catalogue.metaTitle,
      description: t.catalogue.metaDesc,
      type: 'website',
      url: absoluteUrl('/products'),
    },
  };
}

export default async function CataloguePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const l = await lang();
  const t = DICT[l];
  const all = await getAllProducts();

  /* ?category= is where the homepage's category tiles land. Matched
   * case-insensitively against the free-text column, and an unknown value shows
   * the empty state rather than the whole catalogue — a filter that silently
   * ignores itself is worse than one that says it found nothing. */
  const { category } = await searchParams;
  const wanted = category?.trim().toLowerCase();
  const products = wanted ? all.filter((p) => p.category?.trim().toLowerCase() === wanted) : all;

  return (
    <>
      <SiteHeader t={t} lang={l} />

      <main className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="font-display text-4xl font-bold text-forest">
          {category?.trim() || t.catalogue.title}
        </h1>
        <p className="mt-2 text-sm text-fg-muted">{t.catalogue.sub}</p>

        {category ? (
          <a
            href="/products"
            className="mt-4 inline-block rounded-full border border-border px-4 py-1.5 text-xs font-bold text-forest no-underline hover:border-forest"
          >
            ← {t.categories.all}
          </a>
        ) : null}

        {products.length === 0 ? (
          <p className="py-24 text-center text-fg-muted">{t.catalogue.empty}</p>
        ) : (
          <>
            <p className="mt-6 text-xs font-semibold text-fg-muted">
              {products.length} {t.catalogue.count}
            </p>
            <ul className="mt-4 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} t={t} product={p} />
              ))}
            </ul>
          </>
        )}
      </main>

      <SiteFooter t={t} c={LANDING[l]} />
    </>
  );
}
