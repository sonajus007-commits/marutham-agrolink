import { LocaleLink as Link } from '@/components/LocaleLink';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { homepagePrice, fmtMoney, type Product } from '@marutham/lib';
import { OrderButton } from '@/components/OrderButton';
import { AddToCartButton } from '@/components/cart/AddToCartButton';
import { produceImage } from '@/lib/produceImage';
import { ProduceIcon } from '@/components/ui/ProduceIcon';
import type { Dict } from '@/lib/dict';

/* One product in a grid — used by the homepage and the /products catalogue.
 *
 * The card now LINKS somewhere. Before this, the only thing a visitor could do
 * with a product was press "Login to Order", so the public marketplace dead-
 * ended at a sign-in wall: you could not read about a tomato without an account,
 * and a crawler had exactly one page to index. The title and the picture are the
 * link; the order button stays a button, because it hands off to the portal. */
export function ProductCard({
  t,
  product,
  className = '',
}: {
  t: Dict;
  product: Product;
  /** Extra classes on the <li> — e.g. a fixed width when used in the marquee. */
  className?: string;
}) {
  const price = homepagePrice(product);
  const href = `/products/${product.id}`;
  const img = produceImage(product.name, product.regional_name);
  const districts = product.grower_districts ?? [];

  return (
    <li
      className={`rounded-2xl border border-border bg-surface p-3 text-center sm:p-4 transition-shadow hover:shadow-lg ${className}`}
    >
      {/* One link wrapping picture + name: two adjacent links to the same place
          are a known screen-reader annoyance, and the picture is decorative. A
          real photo where we have one (public/produce), otherwise a category line-icon
          on the same tinted tile — never an emoji (see ui/ProduceIcon). */}
      <Link href={href} className="group block no-underline">
        {img ? (
          <span className="relative block aspect-[4/3] w-full overflow-hidden rounded-xl bg-mist">
            {/* Local produce photo → next/image: responsive srcset, lazy load,
                WebP/AVIF. `fill` fills the aspect-ratio box above. */}
            <Image
              src={img}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 18vw, (min-width: 640px) 30vw, 45vw"
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </span>
        ) : (
          <span className="flex aspect-[4/3] w-full items-center justify-center rounded-xl bg-mist">
            <ProduceIcon
              name={product.name}
              category={product.category}
              className="h-12 w-12 text-forest-500"
            />
          </span>
        )}
        <h3 className="mt-3 text-sm font-bold text-fg hover:text-forest-700 hover:underline">
          {product.name}
        </h3>
      </Link>

      {/* Where today's growers are — the district and nothing finer, which is all
          the public-shape policy lets an anonymous visitor see. Replaces a "Farm
          Fresh" badge that sat on every card (milk and mutton included) and so
          said nothing. Absent when no grower has listed it today. */}
      {districts.length ? (
        /* Wraps rather than truncates: the Tamil label is longer, and an ellipsis
           would cut off the district — the one word that matters here. */
        <p className="mt-1 text-xs text-fg-muted">
          <MapPin
            className="mr-1 inline h-3.5 w-3.5 align-[-2px] text-blossom-ink"
            aria-hidden="true"
          />
          {t.fresh.grownIn(districts[0], districts.length - 1)}
        </p>
      ) : null}

      <p className="mt-1 text-lg font-extrabold text-forest-700">
        {price ? (
          <>
            {fmtMoney(price.amount)}
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
          <span className="inline-flex items-center gap-1 rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-bold text-fg">
            <span aria-hidden="true">★</span>
            {product.avg_rating}
          </span>
        </p>
      ) : null}

      <div className="mt-3">
        {price ? (
          <AddToCartButton
            productId={String(product.id)}
            name={product.name}
            unit={price.unit}
            price={price.amount}
            label={t.fresh.add}
          />
        ) : (
          <OrderButton productId={String(product.id)} label={t.fresh.order} />
        )}
      </div>
    </li>
  );
}
