/* The shop's public origin — the one place that knows what host we are served on.
 *
 * It has to exist because a crawler cannot use a relative URL. Open Graph
 * requires an ABSOLUTE og:url (Next silently omits the tag without a
 * metadataBase, so a shared link renders with no preview), and schema.org
 * likewise wants a resolvable url — a bare "/products/x" in JSON-LD is not
 * something Google can fetch.
 *
 * There is no production domain yet, so this defaults to the dev origin: the
 * SAME origin Express serves everything on (see backend/server.js — the shop is
 * proxied at /, the API at /api, the portal at /app). Point SITE_URL at the real
 * hostname at deploy time and every canonical, og:url and JSON-LD url follows.
 */
export const SITE_URL = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** A site-relative path as an absolute URL a crawler can actually follow. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}
