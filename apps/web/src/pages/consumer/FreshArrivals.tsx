import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  bestOffer,
  offerConsumerPrice,
  getProductEmoji,
  fmtMoney,
  type Offer,
  type Product,
  type Rating,
} from '@marutham/lib';
import { useConsumerData } from './ConsumerDataContext';
import { Stars } from './Stars';

const MAX = 10;

interface Arrival {
  product: Product;
  offer: Offer;
  price: number;
  rating?: Rating;
}

/**
 * "Fresh From Nearby Farms" — the platform's differentiator, and seller-forward
 * where the Recommended strip is product-forward. Everything shown is real: the
 * seller, their district, the live rating (or "New" when they have none yet), and
 * today's consumer price via the same helpers the Shop uses so the maths matches.
 *
 * The card opens the Shop rather than adding to cart directly: a fresh listing
 * carries a quantity type (MOQ/SPQ) and per-seller options the strip can't safely
 * pick for the user, so discovery routes to the place built to make that choice.
 */
export function FreshArrivals({ onGoToShop }: { onGoToShop: () => void }) {
  const { t } = useTranslation();
  const { products, offersByProduct, ratingsMap, ratingsByFP } = useConsumerData();

  const arrivals = useMemo<Arrival[]>(() => {
    return products
      .map((product): Arrival | null => {
        const offer = bestOffer(offersByProduct[product.id] || []);
        if (!offer) return null;
        const farmerId = offer.farmer?.id || offer.farmer_id;
        const rating =
          (farmerId ? ratingsByFP[`${farmerId}_${product.id}`] : undefined) ??
          ratingsMap[product.id];
        return { product, offer, price: offerConsumerPrice(offer), rating };
      })
      .filter((a): a is Arrival => a !== null)
      .slice(0, MAX);
  }, [products, offersByProduct, ratingsMap, ratingsByFP]);

  if (arrivals.length === 0) return null;

  return (
    <section className="cons-fresh" aria-label={t('consumer.home.freshArrivals')}>
      <div className="cons-fresh__head">
        <div>
          <h2 className="cons-section-title cons-fresh__title">
            🌱 {t('consumer.home.freshArrivals')}
          </h2>
          <p className="cons-fresh__sub">{t('consumer.home.freshArrivalsSub')}</p>
        </div>
        <button type="button" className="cons-reco__all" onClick={onGoToShop}>
          {t('consumer.home.browseAll')} <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="cons-fresh__strip">
        {arrivals.map(({ product, offer, price, rating }) => {
          const seller = offer.farmer || {};
          const sellerName = [seller.fname, seller.lname].filter(Boolean).join(' ').trim();
          const place = seller.village_town || seller.district;
          return (
            <button
              key={product.id}
              type="button"
              className="cons-fresh__card"
              onClick={onGoToShop}
              aria-label={`${product.name} ${t('consumer.home.by')} ${sellerName || t('consumer.home.sellerNew')} — ${t('consumer.home.from')} ${fmtMoney(price)}`}
            >
              <span className="cons-fresh__media" aria-hidden="true">
                {offer.images && offer.images[0] ? (
                  <img src={offer.images[0]} alt="" loading="lazy" />
                ) : (
                  <span className="cons-fresh__emoji">{getProductEmoji(product.name)}</span>
                )}
                {offer.time_available ? (
                  <span className="cons-fresh__tag">{t('consumer.home.freshToday')}</span>
                ) : null}
              </span>

              <span className="cons-fresh__name">{product.name}</span>

              {sellerName ? (
                <span className="cons-fresh__seller">
                  {t('consumer.home.by')} {sellerName}
                  {place ? ` · ${place}` : ''}
                </span>
              ) : (
                <span className="cons-fresh__seller">{t('consumer.home.sellerNew')}</span>
              )}

              <span className="cons-fresh__foot">
                {rating ? (
                  <Stars value={rating.avg_rating} count={rating.num_ratings} />
                ) : (
                  <span className="cons-fresh__new">{t('consumer.home.sellerNew')}</span>
                )}
                <span className="cons-fresh__price">
                  {t('consumer.home.from')} {fmtMoney(price)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
