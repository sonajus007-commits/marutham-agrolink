import type { MetadataRoute } from 'next';
import { getAllProducts, getCategories } from '@/lib/api';
import { categorySlug } from '@/lib/categorySlug';
import { FARMER_STORIES } from '@/lib/farmerStories';
import { absoluteUrl } from '@/lib/site';
import { localePath } from '@/lib/locale';

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
// Next 15 requires a literal here (not an imported identifier); mirrors REVALIDATE_SECONDS in lib/api.ts.
export const revalidate = 300;

type Freq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;

/* Each page twice — the English path and its /ta twin — and each entry names
 * both as alternates, which is how Google pairs them as one page in two
 * languages rather than two competing duplicates. */
function bilingual(path: string, changeFrequency: Freq, priority: number, lastModified: Date) {
  const languages = {
    'en-IN': absoluteUrl(path),
    'ta-IN': absoluteUrl(localePath('ta', path)),
    'x-default': absoluteUrl(path),
  };
  return [path, localePath('ta', path)].map((p) => ({
    url: absoluteUrl(p),
    lastModified,
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories] = await Promise.all([getAllProducts(), getCategories()]);
  const now = new Date();

  return [
    ...bilingual('/', 'daily', 1, now),
    ...bilingual('/products', 'daily', 0.9, now),
    ...categories.flatMap((c) =>
      bilingual(`/category/${categorySlug(c.name)}`, 'daily', 0.75, now),
    ),
    ...bilingual('/how-it-works', 'monthly', 0.6, now),
    ...bilingual('/about', 'monthly', 0.6, now),
    ...bilingual('/contact', 'monthly', 0.5, now),
    ...bilingual('/farmers', 'weekly', 0.7, now),
    ...FARMER_STORIES.flatMap((s) => bilingual(`/farmer/${s.id}`, 'weekly', 0.6, now)),
    // Produce prices move daily, so a crawler that caches for a week shows
    // stale numbers — say daily and mean it.
    ...products.flatMap((p) => bilingual(`/products/${p.id}`, 'daily', 0.8, now)),
  ];
}
