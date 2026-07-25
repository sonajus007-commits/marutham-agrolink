import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, QtyStepper } from '@marutham/ui';
import {
  offerConsumerPrice,
  offersByRating,
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
  const { t } = useTranslation();
  // Which vendor's photos the top gallery shows. null = default to the first
  // (highest-rated) offer. Reset whenever the sheet switches to another product.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const productId = product?.id ?? null;
  useEffect(() => setSelectedId(null), [productId]);
  if (!product) return null;
  const dp = product.district_price;
  const mktPrice = dp ? parseFloat(String(dp.market_price)) : 0;
  // Offers ordered by rating (highest first) — the same order the rows render in, so
  // the gallery and the list agree on which vendor is "first".
  const sortedOffers = offersByRating(offers, ratingsByFP, product.id);
  const selectedOffer =
    sortedOffers.find((o) => (o.id ?? '') === selectedId) ?? sortedOffers[0] ?? null;
  const selectedSeller = selectedOffer?.farmer;
  const selectedSellerName = selectedSeller
    ? `${selectedSeller.fname || ''}${selectedSeller.lname ? ' ' + selectedSeller.lname : ''}`.trim()
    : '';
  // Only the SELECTED vendor's photos — vendors are never mixed together, and the
  // product's own standard image (the emoji hero below) is never replaced by them.
  const photos = (selectedOffer?.images ?? []).filter(Boolean) as string[];

  return (
    <Sheet open={open} title={product.name} onClose={onClose} backLabel={t('common.back', 'Back')}>
      {photos.length ? (
        <div style={{ marginBottom: 14 }}>
          {selectedSellerName ? (
            <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 6 }}>
              {t('consumer.detail.photosFrom', 'Photos from {{name}}', {
                name: selectedSellerName,
              })}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
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
          }}
        >
          {/* The product's standard identity — the seller's own photos are the gallery
              above, chosen per vendor, and never replace this. */}
          {getProductEmoji(product.name)}
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
              {t('consumer.detail.govtPrice', 'Govt price:')} {fmtMoney(mktPrice)} / {product.unit}
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
          {t('consumer.detail.noOffers', 'No farmers have listed this product today.')}
        </div>
      ) : (
        <>
          <div
            style={{ fontSize: 12, fontWeight: 700, color: 'var(--neutral-700)', marginBottom: 10 }}
          >
            {t('consumer.detail.offerCount', { count: offers.length })}
          </div>
          {sortedOffers.map((o, k) => (
            <OfferRow
              key={o.id || k}
              product={product}
              offer={o}
              mktPrice={mktPrice}
              ratingsByFP={ratingsByFP}
              selected={(o.id ?? '') === (selectedOffer?.id ?? '')}
              onSelect={() => setSelectedId(o.id ?? null)}
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
  selected,
  onSelect,
  onAdd,
  onAdded,
}: {
  product: Product;
  offer: Offer;
  mktPrice: number;
  ratingsByFP: Record<string, Rating>;
  /** This vendor's photos are the ones shown in the top gallery. */
  selected: boolean;
  /** Make this vendor the selected one (swaps the top gallery to their photos). */
  onSelect: () => void;
  onAdd: (item: CartItem) => void;
  onAdded: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const unit = product.unit;
  const defStep = unitStep(unit);
  const minQty =
    offer.qty_type === 'MOQ' || offer.qty_type === 'SPQ'
      ? parseFloat(String(offer.qty_value)) || defStep
      : defStep;
  const step = offer.qty_type === 'SPQ' ? parseFloat(String(offer.qty_value)) || defStep : defStep;
  const [qty, setQty] = useState(minQty);

  const custPrice = offerConsumerPrice(offer);
  const f = offer.farmer || {};
  const soldOut = (offer.qty_available ?? 0) <= 0;
  const perSave = mktPrice > 0 ? mktPrice - custPrice : 0;
  const fpKey = `${f.id || ''}_${product.id}`;
  const farmerRating = ratingsByFP[fpKey];
  const photoCount = (offer.images ?? []).filter(Boolean).length;

  const qtyRule =
    offer.qty_type === 'MOQ'
      ? t('consumer.detail.minQty', 'Min {{qty}} {{unit}}', { qty: offer.qty_value, unit })
      : offer.qty_type === 'SPQ'
        ? t('consumer.detail.packsOf', 'Packs of {{qty}} {{unit}}', { qty: offer.qty_value, unit })
        : '';

  function add() {
    if (isNaN(qty) || qty <= 0)
      return toast(t('consumer.detail.badQty', 'Enter a valid quantity'), 'er');
    if (!unitAllowsDecimal(unit) && qty % 1 !== 0)
      return toast(
        t('consumer.detail.wholeOnly', 'Whole numbers only for {{unit}}', { unit }),
        'er',
      );
    if (offer.qty_type === 'MOQ' && qty < parseFloat(String(offer.qty_value)))
      return toast(
        t('consumer.detail.minOrder', 'Minimum order: {{qty}} {{unit}}', {
          qty: offer.qty_value,
          unit,
        }),
        'er',
      );
    if (
      offer.qty_type === 'SPQ' &&
      Math.round(qty * 100) % Math.round(parseFloat(String(offer.qty_value)) * 100) !== 0
    )
      return toast(
        t('consumer.detail.mustPack', 'Must be in packs of {{qty}} {{unit}}', {
          qty: offer.qty_value,
          unit,
        }),
        'er',
      );
    if (offer.qty_available != null && qty > offer.qty_available)
      return toast(
        t('consumer.shop.onlyAvailable', 'Only {{qty}} {{unit}} available', {
          qty: offer.qty_available,
          unit,
        }).trim(),
        'er',
      );

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
    toast(
      savAmt > 0
        ? t('consumer.detail.addedSave', 'Added — save {{amount}} vs market', {
            amount: fmtMoney(savAmt),
          })
        : t('consumer.detail.added', 'Added to cart'),
      'ok',
    );
    onAdded();
  }

  return (
    <div
      style={{
        border: selected ? '1.5px solid var(--leaf)' : '1.5px solid var(--surface-muted)',
        background: selected ? 'var(--success-bg)' : undefined,
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
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          aria-label={t('consumer.detail.viewSellerPhotos', "View {{name}}'s photos", {
            name: `${f.fname || ''}${f.lname ? ' ' + f.lname : ''}`.trim() || 'seller',
          })}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            background: 'none',
            border: 'none',
            padding: 0,
            margin: 0,
            textAlign: 'left',
            cursor: photoCount > 0 ? 'pointer' : 'default',
            font: 'inherit',
          }}
        >
          {/* Standard product image, not the seller's upload — their photos are shown
              only in the gallery above, and only once this vendor is tapped. */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--surface-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18,
              flexShrink: 0,
            }}
          >
            {getProductEmoji(product.name)}
          </div>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--forest)' }}>
              {f.fname || t('consumer.detail.seller', 'Seller')}
              {f.lname ? ` ${f.lname}` : ''}
            </span>
            <div style={{ fontSize: 10, color: 'var(--gray)' }}>
              {f.village_town || f.district || ''}
            </div>
            {photoCount > 0 ? (
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: selected ? 'var(--success)' : 'var(--leaf)',
                  marginTop: 2,
                }}
              >
                {selected
                  ? t('consumer.detail.showingPhotos', '📷 Showing photos above')
                  : t('consumer.detail.tapForPhotos', '📷 {{n}} photos — tap to view', {
                      n: photoCount,
                    })}
              </div>
            ) : null}
            {farmerRating ? (
              <div style={{ marginTop: 2 }}>
                <Stars value={farmerRating.avg_rating} count={farmerRating.num_ratings} />
              </div>
            ) : null}
          </div>
        </button>
        <div style={{ textAlign: 'right' }}>
          {mktPrice > 0 && custPrice < mktPrice ? (
            <div style={{ fontSize: 10, color: 'var(--gray)', textDecoration: 'line-through' }}>
              {fmtMoney(mktPrice)}
            </div>
          ) : null}
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--leaf)' }}>
            {fmtMoney(custPrice)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--gray)' }}>
            {t('consumer.detail.per', 'per {{unit}}', { unit })}
          </div>
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
            {t('consumer.detail.available', '{{qty}} {{unit}} available', {
              qty: offer.qty_available,
              unit,
            })}
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
            {t('consumer.detail.savePer', 'Save {{amount}}/{{unit}}', {
              amount: fmtMoney(perSave),
              unit,
            })}
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
          {t('consumer.detail.soldOut', 'Sold out from this farmer')}
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
            labels={{
              decrease: t('consumer.qty.decrease', 'Decrease quantity'),
              increase: t('consumer.qty.increase', 'Increase quantity'),
              quantity: t('consumer.qty.quantity', 'Quantity'),
            }}
          />
          <button className="cons-btn-sm" style={{ marginLeft: 'auto' }} onClick={add}>
            {t('consumer.detail.add', 'Add')}
          </button>
        </div>
      )}
    </div>
  );
}
