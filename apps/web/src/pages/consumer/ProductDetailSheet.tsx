import { useState } from 'react';
import { Sheet, QtyStepper } from '@marutham/ui';
import {
  offerConsumerPrice,
  getProductEmoji,
  unitStep,
  unitAllowsDecimal,
  fmtMoney,
  type Product,
  type Offer,
  type Rating,
  type CartItem,
} from '@marutham/lib';
import { Stars } from './Stars';
import { useToast } from '../../components/Toast';

export function ProductDetailSheet({
  product,
  offers,
  rating,
  ratingsByFP,
  open,
  onClose,
  onAdd,
}: {
  product: Product | null;
  offers: Offer[];
  rating?: Rating;
  ratingsByFP: Record<string, Rating>;
  open: boolean;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  if (!product) return null;
  const dp = product.district_price;
  const mktPrice = dp ? parseFloat(String(dp.market_price)) : 0;
  const photos = Array.from(new Set(offers.map((o) => o.images?.[0]).filter(Boolean))) as string[];

  return (
    <Sheet open={open} title={product.name} onClose={onClose}>
      {photos.length ? (
        <div
          style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 14, paddingBottom: 4 }}
        >
          {photos.map((src) => (
            <img
              key={src}
              src={src}
              alt=""
              style={{
                width: 160,
                height: 120,
                objectFit: 'cover',
                borderRadius: 12,
                flexShrink: 0,
              }}
            />
          ))}
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          background: 'var(--bg)',
          borderRadius: 14,
          marginBottom: rating ? 8 : 16,
        }}
      >
        <div
          style={{
            width: 60,
            height: 60,
            borderRadius: 14,
            background: 'var(--surface)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {photos[0] ? (
            <img
              src={photos[0]}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            getProductEmoji(product.name)
          )}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--forest)' }}>
            {product.name}
          </div>
          {product.regional_name ? (
            <div style={{ fontSize: 11, color: 'var(--leaf)' }}>{product.regional_name}</div>
          ) : null}
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
            {product.product_group || ''}
            {product.category ? ` · ${product.category}` : ''}
          </div>
          {mktPrice > 0 ? (
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>
              Govt price: {fmtMoney(mktPrice)} / {product.unit}
            </div>
          ) : null}
        </div>
      </div>

      {rating ? (
        <div
          style={{
            background: 'var(--warning-bg)',
            borderRadius: 10,
            padding: '10px 14px',
            marginBottom: 14,
          }}
        >
          <Stars value={rating.avg_rating} count={rating.num_ratings} />
        </div>
      ) : null}

      {offers.length === 0 ? (
        <div
          style={{
            background: 'var(--tint-50)',
            borderRadius: 12,
            padding: 20,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--gray)',
          }}
        >
          No farmers have listed this product today.
        </div>
      ) : (
        <>
          <div
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--neutral-700)', marginBottom: 10 }}
          >
            {offers.length} seller offer{offers.length > 1 ? 's' : ''} today
          </div>
          {offers.map((o, k) => (
            <OfferRow
              key={o.id || k}
              product={product}
              offer={o}
              mktPrice={mktPrice}
              ratingsByFP={ratingsByFP}
              onAdd={onAdd}
              onAdded={onClose}
            />
          ))}
        </>
      )}
    </Sheet>
  );
}

function OfferRow({
  product,
  offer,
  mktPrice,
  ratingsByFP,
  onAdd,
  onAdded,
}: {
  product: Product;
  offer: Offer;
  mktPrice: number;
  ratingsByFP: Record<string, Rating>;
  onAdd: (item: CartItem) => void;
  onAdded: () => void;
}) {
  const toast = useToast();
  const unit = product.unit;
  const defStep = unitStep(unit);
  const minQty =
    offer.qty_type === 'MOQ' || offer.qty_type === 'SPQ'
      ? parseFloat(String(offer.qty_value)) || defStep
      : defStep;
  const step = offer.qty_type === 'SPQ' ? parseFloat(String(offer.qty_value)) || defStep : defStep;
  const [qty, setQty] = useState(minQty);

  const custPrice = offerConsumerPrice(offer, product);
  const f = offer.farmer || {};
  const soldOut = (offer.qty_available ?? 0) <= 0;
  const perSave = mktPrice > 0 ? mktPrice - custPrice : 0;
  const fpKey = `${f.id || ''}_${product.id}`;
  const farmerRating = ratingsByFP[fpKey];
  const initial = ((f.fname || 'F').charAt(0) + ((f.lname || '').charAt(0) || '')).toUpperCase();

  const qtyRule =
    offer.qty_type === 'MOQ'
      ? `Min ${offer.qty_value} ${unit}`
      : offer.qty_type === 'SPQ'
        ? `Packs of ${offer.qty_value} ${unit}`
        : '';

  function add() {
    if (isNaN(qty) || qty <= 0) return toast('Enter a valid quantity', 'er');
    if (!unitAllowsDecimal(unit) && qty % 1 !== 0)
      return toast(`Whole numbers only for ${unit}`, 'er');
    if (offer.qty_type === 'MOQ' && qty < parseFloat(String(offer.qty_value)))
      return toast(`Minimum order: ${offer.qty_value} ${unit}`, 'er');
    if (
      offer.qty_type === 'SPQ' &&
      Math.round(qty * 100) % Math.round(parseFloat(String(offer.qty_value)) * 100) !== 0
    )
      return toast(`Must be in packs of ${offer.qty_value} ${unit}`, 'er');
    if (offer.qty_available != null && qty > offer.qty_available)
      return toast(`Only ${offer.qty_available} ${unit} available`, 'er');

    onAdd({
      product_id: product.id,
      product_name: product.name,
      unit: product.unit,
      price: custPrice,
      qty,
      farmer_id: f.id || null,
      farmer_name: (f.fname || '') + (f.lname ? ' ' + f.lname : ''),
      listing_id: offer.id || null,
      farmer_price_rs: parseFloat(String(offer.farmer_price)),
    });
    const savAmt = mktPrice > 0 ? (mktPrice - custPrice) * qty : 0;
    toast(savAmt > 0 ? `Added — save ${fmtMoney(savAmt)} vs market` : 'Added to cart', 'ok');
    onAdded();
  }

  return (
    <div
      style={{
        border: '1.5px solid var(--surface-muted)',
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
        opacity: soldOut ? 0.65 : 1,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {offer.images?.[0] ? (
            <img
              src={offer.images[0]}
              alt=""
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--forest)',
                color: 'var(--white)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
          )}
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
              {f.fname || 'Seller'}
              {f.lname ? ` ${f.lname}` : ''}
            </span>
            <div style={{ fontSize: 10, color: 'var(--gray)' }}>
              {f.village_town || f.district || ''}
            </div>
            {farmerRating ? (
              <div style={{ marginTop: 2 }}>
                <Stars value={farmerRating.avg_rating} count={farmerRating.num_ratings} />
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {mktPrice > 0 && custPrice < mktPrice ? (
            <div style={{ fontSize: 10, color: 'var(--gray)', textDecoration: 'line-through' }}>
              {fmtMoney(mktPrice)}
            </div>
          ) : null}
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--leaf)' }}>
            {fmtMoney(custPrice)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--gray)' }}>per {unit}</div>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {!soldOut ? (
          <span
            style={{
              fontSize: 9,
              color: 'var(--gray)',
              background: 'var(--surface-muted)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            {offer.qty_available} {unit} available
          </span>
        ) : null}
        {qtyRule ? (
          <span
            style={{
              fontSize: 9,
              color: 'var(--warning-fg)',
              background: 'var(--warning-bg)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            {qtyRule}
          </span>
        ) : null}
        {perSave > 0 ? (
          <span
            style={{
              fontSize: 9,
              color: 'var(--success)',
              fontWeight: 700,
              background: 'var(--success-bg)',
              borderRadius: 4,
              padding: '2px 6px',
            }}
          >
            Save {fmtMoney(perSave)}/{unit}
          </span>
        ) : null}
      </div>

      {soldOut ? (
        <div
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: 'var(--red)',
            fontWeight: 700,
            padding: 8,
            background: 'var(--danger-bg)',
            borderRadius: 8,
          }}
        >
          Sold out from this farmer
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <QtyStepper
            value={qty}
            min={minQty}
            step={step}
            unit={unit}
            integer={!unitAllowsDecimal(unit)}
            onChange={setQty}
          />
          <button className="cons-btn-sm" style={{ marginLeft: 'auto' }} onClick={add}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}
