import { QtyStepper } from '@marutham/ui';
import {
  bestOffer, offerConsumerPrice, getProductEmoji, unitStep, unitAllowsDecimal,
  orderingWindowStatus, fmtMoney,
  type Product, type Offer, type Rating, type SellerFilter,
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
  const dp = product.district_price;
  const handling = dp ? parseFloat(String(dp.handling)) || 0 : 0;
  const best = bestOffer(offers, seller);
  const custPrice = best ? offerConsumerPrice(best, product) : null;
  const farmerPrice = best ? parseFloat(String(best.farmer_price)) : null;
  const hasStock = !!(best && (best.qty_available ?? 0) > 0);
  const image = best?.images?.[0];
  const f = best?.farmer;
  const availLeft = best?.qty_available != null ? Math.max(0, Number(best.qty_available) - cartQty) : null;
  const ws = orderingWindowStatus();

  return (
    <div className="prod-card">
      <div className="prod-top">
        <div className="prod-thumb">
          {image ? <img src={image} alt="" /> : getProductEmoji(product.name)}
        </div>
        <div style={{ flex: 1 }}>
          <div className="prod-name">{product.name}</div>
          {product.regional_name ? <div style={{ fontSize: 11, color: 'var(--leaf)' }}>{product.regional_name}</div> : null}
          <div className="prod-path">
            {product.product_group ? <span className="prod-chip">{product.product_group}</span> : null}
            {product.category ? <span className="prod-chip" style={{ background: 'var(--warning-bg)', color: 'var(--warning-fg)' }}>{product.category}</span> : null}
            {product.sub_type ? <span style={{ fontSize: 9, color: 'var(--gray)' }}>{product.sub_type}</span> : null}
          </div>
          {rating ? <div style={{ marginTop: 3 }}><Stars value={rating.avg_rating} count={rating.num_ratings} /></div> : null}
          {f ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--gray)' }}>
                {f.fname}{f.lname ? ` ${f.lname}` : ''}{f.village_town ? `, ${f.village_town}` : ''}
              </span>
              <SellerBadge type={f.seller_type} />
            </div>
          ) : null}
        </div>
        <div className="prod-price-box">
          {custPrice != null ? (
            <>
              <div className="prod-price">{fmtMoney(custPrice)}</div>
              <div style={{ fontSize: 9, color: 'var(--gray)' }}>seller {fmtMoney(farmerPrice!)}</div>
              {handling > 0 ? <div style={{ fontSize: 9, color: 'var(--gray)' }}>+{fmtMoney(handling)} hdl</div> : null}
            </>
          ) : dp ? (
            <>
              <div className="prod-price" style={{ fontSize: 12, color: 'var(--gray)' }}>Mkt {fmtMoney(dp.market_price)}</div>
              <div style={{ fontSize: 9, color: 'var(--red)' }}>No offers</div>
            </>
          ) : (
            <div className="prod-price" style={{ fontSize: 12, color: 'var(--gray)' }}>Price TBD</div>
          )}
          <div className="prod-unit">/ {product.unit || 'unit'}</div>
        </div>
      </div>

      <div className="prod-meta-row">
        {product.exotic ? <span className="prod-chip" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>🌶 Perishable</span> : null}
        {best?.time_available ? <span style={{ fontSize: 10, color: 'var(--schedule)' }}>Order by {best.time_available}</span> : null}
        {availLeft != null ? (
          <span style={{ fontSize: 10, color: availLeft <= 0 ? 'var(--red)' : 'var(--gray)' }}>
            {availLeft} {product.unit || ''} avail{cartQty > 0 ? ` (${cartQty} in cart)` : ''}
          </span>
        ) : null}
        {best?.bulk_qty && best?.bulk_disc_pct ? (
          <span style={{ fontSize: 10, color: 'var(--leaf)', fontWeight: 700 }}>Bulk {best.bulk_qty}+ → {best.bulk_disc_pct}% off</span>
        ) : null}

        <div className="prod-actions">
          {custPrice == null && !dp ? (
            <span style={{ fontSize: 10, color: 'var(--gray)' }}>Not in your area</span>
          ) : !best || !hasStock ? (
            <span style={{ fontSize: 10, color: 'var(--red)' }}>No offers today</span>
          ) : !ws.open ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)' }}>🔒 Closed</div>
            </div>
          ) : cartQty === 0 ? (
            <button className="cons-btn-sm" onClick={() => onOpenDetail(product.id)}>View →</button>
          ) : (
            <QtyStepper
              value={cartQty}
              min={0}
              step={unitStep(product.unit)}
              integer={!unitAllowsDecimal(product.unit)}
              onChange={(q) => onChangeQty(product, q)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function SellerBadge({ type }: { type?: string }) {
  const retailer = type === 'Retailer';
  return (
    <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 4, padding: '2px 6px', background: retailer ? 'var(--info-bg)' : 'var(--success-bg)', color: retailer ? 'var(--info)' : 'var(--success)' }}>
      {retailer ? '🏪 Retailer' : '🌱 Direct from Farmer'}
    </span>
  );
}
