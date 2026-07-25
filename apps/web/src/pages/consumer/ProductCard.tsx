import { useTranslation } from 'react-i18next';
import { QtyStepper } from '@marutham/ui';
import {
  bestOffer,
  offerConsumerPrice,
  getProductEmoji,
  unitStep,
  unitAllowsDecimal,
  orderingWindowStatus,
  fmtMoney,
  type Product,
  type Offer,
  type Rating,
  type SellerFilter,
} from '@marutham/lib';
import { Stars } from './Stars';

export function ProductCard({
  product,
  offers,
  rating,
  seller,
  cartQty,
  onOpenDetail,
  onChangeQty,
}: {
  product: Product;
  offers: Offer[];
  rating?: Rating;
  seller: SellerFilter;
  cartQty: number;
  onOpenDetail: (id: string) => void;
  onChangeQty: (product: Product, nextQty: number) => void;
}) {
  const { t } = useTranslation();
  const dp = product.district_price;
  const best = bestOffer(offers, seller);
  const custPrice = best ? offerConsumerPrice(best) : null;
  const hasStock = !!(best && (best.qty_available ?? 0) > 0);
  const f = best?.farmer;
  const availLeft =
    best?.qty_available != null ? Math.max(0, Number(best.qty_available) - cartQty) : null;
  const ws = orderingWindowStatus();

  return (
    <div className="prod-card">
      <div className="prod-top">
        {/* The product's own standard identity (emoji). The seller's own photos are
            shown in the product detail sheet, per vendor, when choosing who to buy
            from — not here, where they would replace the product's standard image. */}
        <div className="prod-thumb">{getProductEmoji(product.name)}</div>
        <div style={{ flex: 1 }}>
          <div className="prod-name">{product.name}</div>
          {product.regional_name ? (
            <div style={{ fontSize: 11, color: 'var(--leaf)' }}>{product.regional_name}</div>
          ) : null}
          <div className="prod-path">
            {product.product_group ? (
              <span className="prod-chip">{product.product_group}</span>
            ) : null}
            {product.category ? (
              <span
                className="prod-chip"
                style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}
              >
                {product.category}
              </span>
            ) : null}
            {product.sub_type ? (
              <span style={{ fontSize: 9, color: 'var(--gray)' }}>{product.sub_type}</span>
            ) : null}
          </div>
          {rating ? (
            <div style={{ marginTop: 3 }}>
              <Stars value={rating.avg_rating} count={rating.num_ratings} />
            </div>
          ) : null}
          {f ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 5,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>
                {f.fname}
                {f.lname ? ` ${f.lname}` : ''}
                {f.village_town ? `, ${f.village_town}` : ''}
              </span>
              <SellerBadge type={f.seller_type} />
            </div>
          ) : null}
        </div>
        <div className="prod-price-box">
          {custPrice != null ? (
            /* The price the customer will pay for the item, and nothing else. What
               the seller is paid is between us and the seller, and handling is an
               order-level charge that is itemised in the cart — showing either here
               made the shelf price look like a sum the customer had to work out. */
            <div className="prod-price">{fmtMoney(custPrice)}</div>
          ) : dp ? (
            <>
              <div className="prod-price" style={{ fontSize: 12, color: 'var(--gray)' }}>
                {t('consumer.card.mkt', 'Mkt')} {fmtMoney(dp.market_price)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--red)' }}>
                {t('consumer.card.noOffers', 'No offers')}
              </div>
            </>
          ) : (
            <div className="prod-price" style={{ fontSize: 12, color: 'var(--gray)' }}>
              {t('consumer.card.priceTbd', 'Price TBD')}
            </div>
          )}
          <div className="prod-unit">/ {product.unit || t('consumer.card.unit', 'unit')}</div>
        </div>
      </div>

      <div className="prod-meta-row">
        {product.exotic ? (
          <span
            className="prod-chip"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}
          >
            🌶 {t('consumer.card.perishable', 'Perishable')}
          </span>
        ) : null}
        {best?.time_available ? (
          <span style={{ fontSize: 10, color: 'var(--schedule)' }}>
            {t('consumer.card.orderBy', 'Order by {{time}}', { time: best.time_available })}
          </span>
        ) : null}
        {availLeft != null ? (
          <span style={{ fontSize: 10, color: availLeft <= 0 ? 'var(--red)' : 'var(--gray)' }}>
            {t('consumer.card.avail', '{{qty}} {{unit}} avail', {
              qty: availLeft,
              unit: product.unit || '',
            })}
            {cartQty > 0
              ? ` ${t('consumer.card.inCart', '({{qty}} in cart)', { qty: cartQty })}`
              : ''}
          </span>
        ) : null}
        {best?.bulk_qty && best?.bulk_disc_pct ? (
          <span style={{ fontSize: 10, color: 'var(--leaf)', fontWeight: 700 }}>
            {t('consumer.card.bulk', 'Bulk {{qty}}+ → {{pct}}% off', {
              qty: best.bulk_qty,
              pct: best.bulk_disc_pct,
            })}
          </span>
        ) : null}

        <div className="prod-actions">
          {custPrice == null && !dp ? (
            <span style={{ fontSize: 10, color: 'var(--gray)' }}>
              {t('consumer.card.notInArea', 'Not in your area')}
            </span>
          ) : !best || !hasStock ? (
            <span style={{ fontSize: 10, color: 'var(--red)' }}>
              {t('consumer.card.noOffersToday', 'No offers today')}
            </span>
          ) : !ws.open ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>
                🔒 {t('consumer.card.closed', 'Closed')}
              </div>
            </div>
          ) : cartQty === 0 ? (
            <button className="cons-btn-sm" onClick={() => onOpenDetail(product.id)}>
              {t('consumer.card.view', 'View')} →
            </button>
          ) : (
            <QtyStepper
              value={cartQty}
              min={0}
              step={unitStep(product.unit)}
              integer={!unitAllowsDecimal(product.unit)}
              onChange={(q) => onChangeQty(product, q)}
              labels={{
                decrease: t('consumer.qty.decrease', 'Decrease quantity'),
                increase: t('consumer.qty.increase', 'Increase quantity'),
                quantity: t('consumer.qty.quantity', 'Quantity'),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SellerBadge({ type }: { type?: string }) {
  const { t } = useTranslation();
  const retailer = type === 'Retailer';
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 700,
        borderRadius: 4,
        padding: '2px 6px',
        background: retailer ? 'var(--info-bg)' : 'var(--success-bg)',
        color: retailer ? 'var(--info)' : 'var(--success)',
      }}
    >
      {retailer
        ? `🏪 ${t('consumer.card.retailer', 'Retailer')}`
        : `🌱 ${t('consumer.card.fromFarmer', 'Direct from Farmer')}`}
    </span>
  );
}
