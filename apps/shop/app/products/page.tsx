import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getAllProducts, REVALIDATE_SECONDS } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { SiteHeader, SiteFooter } from '@/components/SiteChrome';
import { ProductCard } from '@/components/ProductCard';

/* The full catalogue — every product, browsable without an account.
 *
 * This is where "View All Products" goes. It used to go to the sign-in page,
 * which meant the public marketplace showed ten products and then asked for a
 * password, and a crawler could reach exactly one page. */
export const revalidate = REVALIDATE_SECONDS;

function lang(): Lang {
  const c = cookies().get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

export function generateMetadata(): Metadata {
  const t = DICT[lang()];
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

export default async function CataloguePage() {
  const l = lang();
  const t = DICT[l];
  const products = await getAllProducts();

  return (
    <>
      <SiteHeader t={t} lang={l} />

      <main className="mx-auto max-w-6xl px-5 py-12">
        <h1 className="font-display text-4xl font-bold text-forest">{t.catalogue.title}</h1>
        <p className="mt-2 text-sm text-fg-muted">{t.catalogue.sub}</p>

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

      <SiteFooter t={t} />
    </>
  );
}
