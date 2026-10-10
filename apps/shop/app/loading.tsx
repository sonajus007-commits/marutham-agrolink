import { DICT } from '@/lib/dict';
import { getLang } from '@/lib/lang';

/* Shown while a page's server render waits on the API (catalogue, product,
 * category). Without it a slow backend left the previous page frozen with no sign
 * anything was happening. The shape echoes a product grid so the swap to real
 * content does not jump the layout around. */
export default async function Loading() {
  const t = DICT[await getLang()];

  return (
    <main className="mx-auto max-w-6xl px-5 py-12" aria-busy="true">
      <p role="status" className="text-sm font-semibold text-fg-muted">
        {t.status.loading}
      </p>
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="border-border/70 overflow-hidden rounded-2xl border">
            <div className="bg-mist aspect-square animate-pulse" />
            <div className="space-y-2 p-3">
              <div className="bg-mist h-3 w-3/4 animate-pulse rounded" />
              <div className="bg-mist h-3 w-1/2 animate-pulse rounded" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
