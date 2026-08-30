import { useTranslation } from 'react-i18next';
import {
  bestOffer,
  offerConsumerPrice,
  getProductEmoji,
  fmtMoney,
  type Product,
  type Offer,
} from '@marutham/lib';

/* Today's market rates — transparency for the buyer. The APMC mandi price already
 * syncs into product_district_prices (surfaced here as `district_price.market_price`,
 * the same figure the product page calls the "govt price"). This lists produce for
 * which we have today's mandi rate in the buyer's district next to our best price, so
 * a shopper can see they're getting a fair deal. All real data, no new endpoint. */

export function MarketRates({
  products,
  offersByProduct,
}: {
  products: Product[];
  offersByProduct: Record<string, Offer[]>;
}) {
  const { t } = useTranslation();

  const rows = products
    .map((p) => {
      const mandi = p.district_price ? parseFloat(String(p.district_price.market_price)) : 0;
      if (!mandi || mandi <= 0) return null;
      const best = bestOffer(offersByProduct[p.id] || []);
      const price = best ? offerConsumerPrice(best) : null;
      return { product: p, mandi, price };
    })
    .filter((x): x is { product: Product; mandi: number; price: number | null } => x !== null)
    .slice(0, 8);

  if (rows.length === 0) return null;

  return (
    <section className="cons-market" aria-labelledby="cons-market-title">
      <div className="cons-section-head">
        <h2 id="cons-market-title" className="cons-section-title">
          📈 {t('consumer.home.market.title', "Today's market rates")}
        </h2>
        <p className="cons-fresh__sub">
          {t('consumer.home.market.sub', 'The local mandi rate, next to our best price.')}
        </p>
      </div>

      <div className="cons-market__list">
        {rows.map(({ product, mandi, price }) => {
          const save = price != null && mandi > price ? mandi - price : 0;
          return (
            <div className="cons-market__row" key={product.id}>
              <span className="cons-market__emoji" aria-hidden="true">
                {getProductEmoji(product.name)}
              </span>
              <span className="cons-market__name">
                {product.name}
                {product.regional_name ? (
                  <span className="cons-market__reg"> · {product.regional_name}</span>
                ) : null}
              </span>
              <span className="cons-market__mandi">
                <span className="cons-market__lbl">{t('consumer.home.market.mandi', 'Mandi')}</span>
                {fmtMoney(mandi)}/{product.unit}
              </span>
              <span className="cons-market__ours">
                {price != null ? (
                  <>
                    <span className="cons-market__lbl">
                      {t('consumer.home.market.ours', 'Ours')}
                    </span>
                    {fmtMoney(price)}
                    {save > 0 ? (
                      <span className="cons-market__save">
                        {' '}
                        {t('consumer.home.market.save', 'save {{amt}}', { amt: fmtMoney(save) })}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="cons-market__lbl">
                    {t('consumer.home.market.soon', 'Coming soon')}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
