import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { getCatalogue } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { ProductCard } from '@/components/ProductCard';

/* The catalogue — every product, browsable without an account, now with
 * server-side search / category filter / sort / pagination. The API returns one
 * bounded page at a time; the controls here are plain links and a GET form, so
 * the whole thing works with no client JS and every filtered view is a real,
 * crawlable URL. */
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

const PAGE_SIZE = 20;

type SP = { q?: string; category?: string; sort?: string; page?: string };

async function lang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const t = DICT[await lang()];
  const { q, category } = await searchParams;
  const title = q
    ? `${t.catalogue.resultsFor(q)} — Marutham AgroLink`
    : category
      ? `${category} — Marutham AgroLink`
      : t.catalogue.metaTitle;
  // A category is a canonical, indexable page; a free-text search is not (it
  // would spawn endless thin duplicates), so search results are noindex.
  const canonical = category ? `/products?category=${encodeURIComponent(category)}` : '/products';
  return {
    title,
    description: t.catalogue.metaDesc,
    alternates: { canonical },
    robots: q ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      title,
      description: t.catalogue.metaDesc,
      type: 'website',
      url: absoluteUrl(canonical),
    },
  };
}

export default async function CataloguePage({ searchParams }: { searchParams: Promise<SP> }) {
  const l = await lang();
  const t = DICT[l];
  const sp = await searchParams;

  const q = sp.q?.trim() || '';
  const category = sp.category?.trim() || '';
  const sort = sp.sort === 'newest' ? 'newest' : 'name';
  const page = Math.max(parseInt(sp.page || '1', 10) || 1, 1);

  const { products, count, pageCount } = await getCatalogue({
    q,
    category,
    sort,
    page,
    limit: PAGE_SIZE,
  });

  // Build an href that keeps the current filters and overrides some of them.
  const href = (over: Partial<SP>) => {
    const next: Record<string, string> = {};
    if (q) next.q = q;
    if (category) next.category = category;
    if (sort !== 'name') next.sort = sort;
    if (page > 1) next.page = String(page);
    for (const [k, v] of Object.entries(over)) {
      if (v === undefined || v === '' || v === null) delete next[k];
      else next[k] = String(v);
    }
    const qs = new URLSearchParams(next).toString();
    return qs ? `/products?${qs}` : '/products';
  };

  const heading = q ? t.catalogue.resultsFor(q) : category || t.catalogue.title;
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
        <h1 className="text-forest-900 text-3xl font-bold tracking-tight md:text-4xl">{heading}</h1>
        <p className="text-fg-muted mt-2 text-body">{t.catalogue.sub}</p>

        {/* Toolbar: search + sort. A GET form needs no JS; hidden inputs keep the
            active category/sort while searching. */}
        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <form action="/products" role="search" className="w-full max-w-md">
            {category ? <input type="hidden" name="category" value={category} /> : null}
            {sort !== 'name' ? <input type="hidden" name="sort" value={sort} /> : null}
            <label className="border-border bg-bg focus-within:border-forest-500 flex items-center gap-2.5 rounded-full border px-4 py-2.5 transition-colors">
              <Search className="text-fg-muted h-4 w-4 shrink-0" aria-hidden="true" />
              <input
                type="search"
                name="q"
                defaultValue={q}
                placeholder={t.catalogue.searchPlaceholder}
                aria-label={t.catalogue.searchPlaceholder}
                className="text-fg placeholder:text-fg-muted min-w-0 flex-1 bg-transparent text-caption outline-none"
              />
            </label>
          </form>

          <div className="flex items-center gap-2">
            <span className="text-fg-muted text-caption font-semibold">
              {t.catalogue.sortLabel}:
            </span>
            {sortLink('name', t.catalogue.sortName)}
            {sortLink('newest', t.catalogue.sortNewest)}
          </div>
        </div>

        {/* Active-filter chips: clear a category / clear a search. */}
        {category || q ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {category ? (
              <Link
                href={href({ category: undefined, page: undefined })}
                className="border-border text-forest-700 hover:border-forest-500 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-semibold no-underline"
              >
                {category} ✕
              </Link>
            ) : null}
            {q ? (
              <Link
                href={href({ q: undefined, page: undefined })}
                className="border-border text-forest-700 hover:border-forest-500 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-caption font-semibold no-underline"
              >
                “{q}” ✕
              </Link>
            ) : null}
          </div>
        ) : null}

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
