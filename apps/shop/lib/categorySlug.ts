/* A category's free-text name (e.g. "Grains, Rice & Pasta") ↔ a URL slug
 * (e.g. "grains-rice-pasta"). Slugifying is lossy, so the /category/[slug] page
 * resolves a slug back to the exact name by matching against the live category
 * list rather than trying to un-slug it. */
export function categorySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
