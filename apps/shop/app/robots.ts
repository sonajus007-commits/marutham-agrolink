import type { MetadataRoute } from 'next';
import { absoluteUrl } from '@/lib/site';

/* /robots.txt
 *
 * The public marketplace is the ONLY part of this origin a crawler should touch.
 * /app is the signed-in portal (a Vite SPA that serves a bot an empty <div>) and
 * /api is the REST API — indexing either wastes crawl budget on pages that can
 * never rank, and puts raw JSON endpoints in search results. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/app/', '/api/'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
  };
}
