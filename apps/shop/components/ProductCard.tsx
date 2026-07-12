import Link from 'next/link';
import { homepagePrice, productEmoji, type Product } from '@marutham/lib';
import { OrderButton } from '@/components/OrderButton';
import type { Dict } from '@/lib/dict';

/* One product in a grid — used by the homepage and the /products catalogue.
 *
 * The card now LINKS somewhere. Before this, the only thing a visitor could do
 * with a product was press "Login to Order", so the public marketplace dead-
 * ended at a sign-in wall: you could not read about a tomato without an account,
 * and a crawler had exactly one page to index. The title and the picture are the
 * link; the order button stays a button, because it hands off to the portal. */
export function ProductCard({ t, product }: { t: Dict; product: Product }) {
  const price = homepagePrice(product);
  const href = `/products/${product.id}`;

  return (
    <li className="rounded-2xl border border-border bg-surface p-4 text-center transition-shadow hover:shadow-lg">
      {/* One link wrapping picture + name: two adjacent links to the same place
          are a known screen-reader annoyance, and the emoji is decorative. */}
      <Link href={href} className="block no-underline">
        <span className="block text-5xl" aria-hidden="true">{productEmoji(product.name)}</span>
        <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-forest">
          {t.fresh.badge}
        </span>
        <h3 className="mt-2 text-sm font-bold text-fg hover:text-forest hover:underline">{product.name}</h3>
      </Link>

      <p className="mt-1 text-lg font-extrabold text-forest">
        {price ? (
          <>
            ₹{price.amount.toFixed(0)}
            <span className="text-xs font-semibold text-fg-muted">/{price.unit}</span>
          </>
        ) : (
          <span className="text-xs font-semibold text-fg-muted">{t.fresh.unavailable}</span>
        )}
      </p>

      {/* Gold FILLS, it does not ink: `text-gold` here was 2.21:1 on white. It
          only escaped the slice-1 axe run because none of the first ten
          products on the homepage happen to carry a rating. */}
      {product.avg_rating ? (
        <p className="mt-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-gold px-2 py-0.5 text-[11px] font-bold text-fg">
            <span aria-hidden="true">★</span>
            {product.avg_rating}
          </span>
        </p>
      ) : null}

      <OrderButton productId={String(product.id)} label={t.fresh.order} />
    </li>
  );
}
