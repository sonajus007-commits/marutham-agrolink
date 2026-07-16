import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  homepagePrice,
  productEmoji,
  sortedOffers,
  districtPriceRows,
  productJsonLd,
  fmtMoney,
  HOME_DISTRICT,
  type PublicListing,
} from '@marutham/lib';
import { getProduct } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang, type Dict, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { OrderButton } from '@/components/OrderButton';

/* A public product page — the reason the API moved off the root.
 *
 * This is the marketplace's SEO surface: one indexable, server-rendered page per
 * product, carrying the price, the growers selling it today and schema.org
 * markup a search engine can turn into a rich result. None of that was possible
 * from the SPA at /app, which ships a crawler an empty <div>.
 *
 * The grower is a DISTRICT and nothing else. That is not this page being coy —
 * it is the API's allow-list (backend/utils/publicShape.js): an anonymous caller
 * is never sent a farmer's name. Signing in is what buys you the name, and the
 * page says so rather than leaving a suspicious blank. */
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

interface Params {
  params: Promise<{ id: string }>;
}

async function lang(): Promise<Lang> {
  const c = (await cookies()).get(LANG_COOKIE)?.value;
  return isLang(c) ? c : DEFAULT_LANG;
}

/* Next memoises fetch() across generateMetadata and the render, so asking for the
 * product twice costs one request. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const detail = await getProduct(id);
  const t = DICT[await lang()];

  if (!detail) {
    return { title: t.product.notFound, robots: { index: false, follow: false } };
  }

  const { product } = detail;
  const price = homepagePrice(product);
  const priceText = price ? `${fmtMoney(price.amount)}/${price.unit}` : '';
  const title = `${product.name}${product.regional_name ? ` (${product.regional_name})` : ''} — Marutham AgroLink`;
  const description = t.product.metaDesc(product.name, priceText);

  return {
    title,
    description,
    alternates: { canonical: `/products/${product.id}` },
    openGraph: {
      title,
      description,
      type: 'website',
      url: absoluteUrl(`/products/${product.id}`),
    },
  };
}

export default async function ProductPage({ params }: Params) {
  const { id } = await params;
  const l = await lang();
  const t = DICT[l];

  // null means the API said 404. A dead backend THROWS instead of landing here —
  // serving a 404 for a product that exists would tell Google to de-index it.
  const detail = await getProduct(id);
  if (!detail) notFound();

  const { product, listings } = detail;
  const price = homepagePrice(product);
  const offers = sortedOffers(listings);
  const districts = districtPriceRows(product);

  // Absolute — a crawler cannot resolve "/products/x" out of a JSON-LD blob.
  const jsonLd = productJsonLd({
    product,
    price: price?.amount ?? null,
    listings,
    url: absoluteUrl(`/products/${product.id}`),
  });

  return (
    <>
      <SiteHeader t={t} lang={l} />

      {jsonLd ? (
        <script
          type="application/ld+json"
          // The payload is built from our own API's values, not user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <main className="mx-auto max-w-5xl px-5 py-8">
        <Breadcrumb t={t} name={product.name} />

        {/* ── The product ────────────────────────────────────────────────── */}
        <section className="mt-6 flex flex-col gap-8 sm:flex-row sm:items-start">
          <div
            className="flex h-40 w-full shrink-0 items-center justify-center rounded-2xl bg-muted text-8xl sm:w-56"
            aria-hidden="true"
          >
            {productEmoji(product.name)}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-display text-4xl font-bold text-forest">{product.name}</h1>
            {product.regional_name ? (
              <p className="mt-1 text-lg text-fg-muted">{product.regional_name}</p>
            ) : null}

            <div className="mt-3 flex flex-wrap gap-2">
              {product.category ? <Tag>{product.category}</Tag> : null}
              {product.product_group ? <Tag>{product.product_group}</Tag> : null}
              {product.exotic ? <Tag>Exotic</Tag> : null}
            </div>

            <p className="mt-5">
              {price ? (
                <>
                  <span className="font-display text-4xl font-extrabold text-forest">
                    {fmtMoney(price.amount)}
                  </span>
                  <span className="ml-1 text-sm font-semibold text-fg-muted">
                    {t.product.perUnit} {price.unit} · {HOME_DISTRICT}
                  </span>
                </>
              ) : (
                <span className="text-sm font-semibold text-fg-muted">{t.fresh.unavailable}</span>
              )}
            </p>

            <div className="mt-5 max-w-xs">
              <OrderButton productId={String(product.id)} label={t.fresh.order} />
            </div>
          </div>
        </section>

        <Offers t={t} offers={offers} unit={price?.unit || (product.unit as string) || ''} />
        <DistrictPrices t={t} rows={districts} unit={(product.unit as string) || ''} />
      </main>

      <SiteFooter t={t} c={LANDING[l]} />
    </>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-forest">
      {children}
    </span>
  );
}

function Breadcrumb({ t, name }: { t: Dict; name: string }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex list-none flex-wrap items-center gap-2 p-0 text-xs font-semibold text-fg-muted">
        <li>
          <Link href="/" className="no-underline hover:text-forest hover:underline">
            {t.product.home}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li>
          <Link href="/products" className="no-underline hover:text-forest hover:underline">
            {t.product.all}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="text-forest">
          {name}
        </li>
      </ol>
    </nav>
  );
}

/* Today's growers.
 *
 * The empty state is the COMMON case, not the edge case: farmer_listings are
 * reset every night (listed=false after the daily cutoff — see the hourly job in
 * backend/server.js), so most products have no live offer for most of the day.
 * It has to read as a normal rhythm of the market, not as a broken page. */
function Offers({ t, offers, unit }: { t: Dict; offers: PublicListing[]; unit: string }) {
  return (
    <section className="mt-14">
      <h2 className="font-display text-2xl font-bold text-forest">{t.product.offers}</h2>
      <p className="mt-1 text-sm text-fg-muted">
        {offers.length ? t.product.offersSub : t.product.privacy}
      </p>

      {offers.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-semibold text-fg">{t.product.noOffers}</p>
          <p className="mt-1 text-sm text-fg-muted">{t.product.noOffersSub}</p>
        </div>
      ) : (
        <ul className="mt-6 grid list-none gap-3 p-0 sm:grid-cols-2">
          {offers.map((o, i) => (
            <li
              key={o.id || i}
              className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-fg">
                  {t.product.grower} · {o.farmer?.district || '—'}
                </p>
                {/* bg-gold + dark ink (6.90:1). `text-gold` is 2.21:1 on white. */}
                {o.farmer_avg_rating ? (
                  <p className="mt-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-fg">
                      <span aria-hidden="true">★</span>
                      {o.farmer_avg_rating}
                    </span>
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-fg-muted">
                  {o.qty_available} {unit} {t.product.available}
                  {o.time_available ? ` · ${t.product.window} ${o.time_available}` : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="text-xl font-extrabold text-forest">
                  {fmtMoney(o.farmer_price)}
                </span>
                {unit ? <span className="block text-[11px] text-fg-muted">/{unit}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DistrictPrices({
  t,
  rows,
  unit,
}: {
  t: Dict;
  rows: Array<{ district: string; amount: number }>;
  unit: string;
}) {
  if (rows.length === 0) return null;

  return (
    <section className="mt-14 pb-8">
      <h2 className="font-display text-2xl font-bold text-forest">{t.product.prices}</h2>
      <p className="mt-1 text-sm text-fg-muted">{t.product.pricesSub}</p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="py-2 pr-4 font-bold text-fg">{t.product.district}</th>
              <th className="py-2 text-right font-bold text-fg">{t.product.price}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.district} className="border-b border-border">
                <td className="py-2 pr-4 text-fg-muted">{r.district}</td>
                <td className="py-2 text-right font-bold text-forest">
                  {fmtMoney(r.amount)}
                  {unit ? <span className="font-normal text-fg-muted">/{unit}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
