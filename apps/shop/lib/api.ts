import 'server-only';
import type { Product, PublicListing } from '@marutham/lib';

/* Server-side reads for the public marketplace.
 *
 * These run on the SERVER, so they hit Express directly (INTERNAL_API_URL,
 * default http://localhost:3000) rather than going back out through the proxy.
 * They carry NO Authorization header and must never grow one: this is the
 * anonymous marketplace, and the endpoints it uses are the two that are public
 * on purpose — GET /products and GET /config/stats.
 *
 * The public product endpoints anonymise the grower server-side (district only,
 * never a name or a village — backend/utils/publicShape.js). That is enforced by
 * the API, not by this layer, so an SSR page cannot accidentally reveal it.
 *
 * A dead API must not take the homepage down with it: every read degrades to a
 * sane empty value and the page still renders its hero, its story and its
 * sign-up call to action. A marketing page that 500s because a database is slow
 * is a worse outcome than a marketing page with no product grid.
 */

// The API answers under /api. The root of this origin is the shop itself — these
// requests would otherwise fetch our own pages and try to parse HTML as JSON.
const API = (process.env.INTERNAL_API_URL || 'http://localhost:3000') + '/api';

/** Revalidate the cached render this often (seconds). Produce prices move daily. */
export const REVALIDATE_SECONDS = 300;

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(API + path, {
      next: { revalidate: REVALIDATE_SECONDS },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`[shop] GET ${path} → HTTP ${res.status}`);
      return fallback;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.error(`[shop] GET ${path} failed:`, e instanceof Error ? e.message : e);
    return fallback;
  }
}

export async function getAvailableProducts(): Promise<Product[]> {
  /* The homepage derives its category rail + Fresh Today + hero from the whole
   * available set. The API now bounds every response, so ask for a generous page
   * (100, the API's max) rather than relying on the old unbounded default. */
  const data = await getJson<{ products?: Product[] }>('/products?available=true&limit=100', {});
  return data.products || [];
}

export interface PublicStats {
  activeSellers: number;
  happyCustomers: number;
  activeDistricts: number;
  activeStates: number;
}

export async function getPublicStats(): Promise<PublicStats> {
  return getJson<PublicStats>('/config/stats', {
    activeSellers: 0,
    happyCustomers: 0,
    activeDistricts: 0,
    activeStates: 0,
  });
}

export interface CatalogueParams {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}

export interface CataloguePage {
  products: Product[];
  /** Total rows matching the filters, across all pages. */
  count: number;
  page: number;
  limit: number;
  pageCount: number;
}

/* One page of the catalogue, filtered/searched/sorted server-side. This is the
 * bounded read the /products page and search use — the API never returns the
 * whole catalogue at once. */
export async function getCatalogue(params: CatalogueParams = {}): Promise<CataloguePage> {
  const limit = params.limit ?? 24;
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;

  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (params.q?.trim()) qs.set('q', params.q.trim());
  if (params.category?.trim()) qs.set('category', params.category.trim());
  if (params.sort) qs.set('sort', params.sort);

  const data = await getJson<{ products?: Product[]; count?: number }>(`/products?${qs}`, {});
  const products = data.products || [];
  const count = data.count ?? products.length;
  return { products, count, page, limit, pageCount: Math.max(Math.ceil(count / limit), 1) };
}

/* The WHOLE catalogue, paged through — for the sitemap, which needs every URL.
 * Bounded per request (100 at a time) but complete overall; a hard page cap
 * keeps a runaway catalogue from looping forever. */
export async function getAllProducts(): Promise<Product[]> {
  const limit = 100;
  const out: Product[] = [];
  for (let page = 1; page <= 100; page++) {
    const { products } = await getCatalogue({ page, limit });
    out.push(...products);
    if (products.length < limit) break;
  }
  return out;
}

/** A product and the live offers under it, as an anonymous visitor sees them. */
export interface ProductDetail {
  product: Product;
  listings: PublicListing[];
}

/**
 * One product, or null when it genuinely does not exist.
 *
 * This does NOT follow the degrade-to-empty rule the rest of this file does, and
 * the difference is the whole point:
 *
 *   404 from the API  → null → the page calls notFound() → we serve a real 404.
 *   anything else     → THROW → Next serves a 5xx.
 *
 * Degrading a dead backend to "product not found" would be an SEO own-goal. A
 * 404 tells a crawler the product is gone and to drop it from the index; a 5xx
 * tells it to come back later. So a slow database must never be allowed to
 * quietly de-list the catalogue — it has to fail loudly instead.
 *
 * The homepage can degrade because an empty marketing page is still a page. A
 * product page with no product is not.
 */
export async function getProduct(id: string): Promise<ProductDetail | null> {
  const res = await fetch(`${API}/products/${encodeURIComponent(id)}`, {
    next: { revalidate: REVALIDATE_SECONDS },
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`[shop] GET /products/${id} → HTTP ${res.status}`);
  }

  const data = (await res.json()) as Partial<ProductDetail>;
  if (!data.product) return null;
  return { product: data.product, listings: data.listings || [] };
}
