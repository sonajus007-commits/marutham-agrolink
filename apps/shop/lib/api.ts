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
  const data = await getJson<{ products?: Product[] }>('/products?available=true', {});
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

/** The whole public catalogue, for the /products index. */
export async function getAllProducts(): Promise<Product[]> {
  const data = await getJson<{ products?: Product[] }>('/products', {});
  return data.products || [];
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
