import type { MetadataRoute } from 'next';
import { getAllProducts, REVALIDATE_SECONDS } from '@/lib/api';
import { absoluteUrl } from '@/lib/site';

/* /sitemap.xml — how a crawler finds the product pages at all.
 *
 * Without it the catalogue is the only route into them, and a page nothing links
 * to from outside is a page Google discovers slowly, if ever. Every product page
 * exists precisely to be indexed, so listing them is the last step of making
 * them real.
 *
 * If the API is unreachable this degrades to the static routes rather than
 * throwing: a sitemap that 500s is worse than a short one, because a crawler
 * backs off the whole site. */
export const revalidate = REVALIDATE_SECONDS;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getAllProducts();
  const now = new Date();

  return [
    { url: absoluteUrl('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: absoluteUrl('/products'), lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.id}`),
      // Produce prices move daily, so a crawler that caches for a week shows
      // stale numbers — say daily and mean it.
      lastModified: now,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ];
}
