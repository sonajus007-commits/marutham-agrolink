import 'server-only';
import type { Product } from '@marutham/lib';

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

const API = process.env.INTERNAL_API_URL || 'http://localhost:3000';

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
