import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCategories, getCatalogue } from '@/lib/api';
import { categorySlug } from '@/lib/categorySlug';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { ProductCard } from '@/components/ProductCard';

/* /category/[slug] — a clean, indexable URL per category (better than
 * ?category=). The slug is resolved back to the exact category name against the
 * live list; an unknown slug 404s. Products come one bounded page at a time from
 * the same catalogue API. */
export const revalidate = 300;

const PAGE_SIZE = 20;

type SP = { sort?: string; page?: string };

async function lang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((c) => ({ slug: categorySlug(c.name) }));
}

/** Resolve a slug to the exact category name, or null. */
async function resolveCategory(slug: string): Promise<string | null> {
  const categories = await getCategories();
  return categories.find((c) => categorySlug(c.name) === slug)?.name ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = await resolveCategory(slug);
  const t = DICT[await lang()];
  if (!name) return { title: t.catalogue.metaTitle };
  const title = `${name} — Marutham AgroLink`;
  const canonical = `/category/${slug}`;
  return {
    title,
    description: t.catalogue.metaDesc,
    alternates: { canonical },
    openGraph: {
      title,
      description: t.catalogue.metaDesc,
      type: 'website',
      url: absoluteUrl(canonical),
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const name = await resolveCategory(slug);
  if (!name) notFound();

  const l = await lang();
  const t = DICT[l];
  const sp = await searchParams;
  const sort = sp.sort === 'newest' ? 'newest' : 'name';
  const page = Math.max(parseInt(sp.page || '1', 10) || 1, 1);

  const { products, count, pageCount } = await getCatalogue({
    category: name,
    sort,
    page,
    limit: PAGE_SIZE,
  });

  const href = (over: SP) => {
    const next: Record<string, string> = {};
    if (sort !== 'name') next.sort = sort;
    if (page > 1) next.page = String(page);
    for (const [k, v] of Object.entries(over)) {
      if (!v) delete next[k];
      else next[k] = String(v);
    }
    const qs = new URLSearchParams(next).toString();
    return qs ? `/category/${slug}?${qs}` : `/category/${slug}`;
  };

  const from = count === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, count);

  const sortLink = (key: 'name' | 'newest', label: string) => {
    const active = sort === key;
    return (
      <Link
        href={href({ sort: key === 'name' ? undefined : key, page: undefined })}
        aria-current={active || undefined}
        className={`rounded-full border px-3 py-1.5 text-caption font-semibold no-underline transition-colors ${
          active
            ? 'border-forest-700 bg-forest-700 text-surface'
            : 'border-border text-fg-muted hover:border-forest-500 hover:text-forest-700'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <>
      <SiteHeader t={t} lang={l} />

      <main className="mx-auto max-w-6xl px-5 py-12">
        <Link
          href="/products"
          className="text-forest-700 hover:text-forest-900 text-caption font-semibold no-underline"
        >
          ← {t.categories.all}
        </Link>

        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-forest-900 text-3xl font-bold tracking-tight md:text-4xl">{name}</h1>
          <div className="flex items-center gap-2">
            <span className="text-fg-muted text-caption font-semibold">
              {t.catalogue.sortLabel}:
            </span>
            {sortLink('name', t.catalogue.sortName)}
            {sortLink('newest', t.catalogue.sortNewest)}
          </div>
        </div>

        {products.length === 0 ? (
          <p className="text-fg-muted py-24 text-center">{t.catalogue.empty}</p>
        ) : (
          <>
            <p className="text-fg-muted mt-6 text-caption font-semibold">
              {t.catalogue.showing(from, to, count)}
            </p>
            <ul className="mt-4 grid list-none grid-cols-2 gap-4 p-0 sm:grid-cols-3 lg:grid-cols-5">
              {products.map((p) => (
                <ProductCard key={p.id} t={t} product={p} />
              ))}
            </ul>

            {pageCount > 1 ? (
              <nav
                aria-label="Pagination"
                className="mt-10 flex items-center justify-center gap-3 text-caption font-semibold"
              >
                {page > 1 ? (
                  <Link
                    href={href({ page: page - 1 === 1 ? undefined : String(page - 1) })}
                    className="border-border text-forest-700 hover:border-forest-500 rounded-full border px-4 py-2 no-underline"
                  >
                    ← {t.catalogue.prev}
                  </Link>
                ) : (
                  <span className="text-fg-muted rounded-full border border-transparent px-4 py-2">
                    ← {t.catalogue.prev}
                  </span>
                )}
                <span className="text-fg-muted tabular-nums">
                  {page} / {pageCount}
                </span>
                {page < pageCount ? (
                  <Link
                    href={href({ page: String(page + 1) })}
                    className="border-border text-forest-700 hover:border-forest-500 rounded-full border px-4 py-2 no-underline"
                  >
                    {t.catalogue.next} →
                  </Link>
                ) : (
                  <span className="text-fg-muted rounded-full border border-transparent px-4 py-2">
                    {t.catalogue.next} →
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </main>

      <SiteFooter t={t} c={LANDING[l]} />
    </>
  );
}
