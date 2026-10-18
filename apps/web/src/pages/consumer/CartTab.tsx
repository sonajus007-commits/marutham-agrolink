import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QtyStepper, EmptyState } from '@marutham/ui';
import {
  cartBill,
  bestOffer,
  getProductEmoji,
  unitStep,
  unitAllowsDecimal,
  fmtMoney,
  fmtKm,
  defaultAddressIndex,
  FREE_DELIVERY_MIN,
  type Offer,
  type Order,
  type SavedAddress,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useDeliveryQuote } from './useDeliveryQuote';
import { useConsumerData } from './ConsumerDataContext';
import { useCart } from './CartContext';
import { useToast } from '../../components/Toast';
import { Checkout } from './Checkout';

function offerAvailable(offers: Offer[], listingId?: string | null): number {
  const o = listingId ? offers.find((x) => x.id === listingId) : bestOffer(offers, 'All');
  return o && o.qty_available != null ? Number(o.qty_available) : Infinity;
}

export function CartTab({ onOrderPlaced }: { onOrderPlaced: (order: Order) => void }) {
  const { t } = useTranslation();
  const { productById, offersByProduct } = useConsumerData();
  const cart = useCart();
  const toast = useToast();
  const { user } = useAuth();

  // The address delivery is priced to — Checkout reports the buyer's pick; until
  // then, the default saved address (else the profile, which carries no pin).
  const addrs = (user?.delivery_addresses as SavedAddress[]) || [];
  const defIdx = defaultAddressIndex(addrs);
  const [quoteAddress, setQuoteAddress] = useState<Record<string, unknown> | null>(
    defIdx === null ? null : (addrs[defIdx] as Record<string, unknown>),
  );
  const sellerGeo = useDeliveryQuote(
    cart.items.map((i) => i.farmer_id || '').filter(Boolean),
    quoteAddress,
  );

  if (cart.items.length === 0) {
    return (
      <EmptyState icon="🛒">
        {t('consumer.cart.empty', 'Your cart is empty.')}
        <br />
        {t('consumer.cart.emptyHint', 'Browse the shop to add items.')}
      </EmptyState>
    );
  }

  const bill = cartBill(cart.items, productById, sellerGeo ?? undefined);
  const dq = bill.deliveryQuote;
  const sellerName = (farmerId: string) =>
    cart.items.find((i) => i.farmer_id === farmerId)?.farmer_name || '';
  // The free-delivery nudge counts LOCAL items only — far sellers are never free.
  const localTotal = dq ? dq.localItemTotal : bill.itemSubtotal;
  const showFreeNudge =
    (dq ? dq.hasLocal : true) && localTotal > 0 && localTotal < FREE_DELIVERY_MIN;

  function setQty(index: number, next: number) {
    const item = cart.items[index];
    const avail = offerAvailable(offersByProduct[item.product_id] || [], item.listing_id);
    let q = next;
    if (q > avail) {
      q = avail;
      toast(
        t('consumer.shop.onlyAvailable', 'Only {{qty}} {{unit}} available', {
          qty: avail,
          unit: item.unit || '',
        }).trim(),
        'er',
      );
    }
    cart.updateQtyAt(index, q);
  }

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--forest)' }}>
        🛒 {t('consumer.cart.title', 'Your Cart')}
      </div>

      {cart.items.map((item, idx) => {
        const p = productById[item.product_id] || {};
        const dp = p.district_price;
        const unitPrice = parseFloat(String(item.price));
        const lineTotal = unitPrice * item.qty;
        const mkt = dp ? parseFloat(String(dp.market_price)) : 0;
        return (
          <div key={idx} className="prod-card" style={{ padding: '12px 14px' }}>
            <div className="cart-line">
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg,var(--success-bg),var(--success-bg))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 24,
                  flexShrink: 0,
                }}
              >
                {/* The product's standard image — seller uploads are shown only in the
                    product detail sheet, per vendor, on tap. */}
                {getProductEmoji(item.product_name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--forest)' }}>
                  {item.product_name}
                </div>
                {item.farmer_name ? (
                  <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--gray)', marginTop: 2 }}>
                    {t('consumer.cart.fromSeller', 'from {{name}}', { name: item.farmer_name })}
                  </div>
                ) : null}
                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                  {fmtMoney(unitPrice)} / {item.unit}
                </div>
                {mkt > 0 && unitPrice < mkt ? (
                  <div
                    style={{
                      fontSize: 'var(--fs-2xs)',
                      color: 'var(--success)',
                      fontWeight: 700,
                      marginTop: 2,
                    }}
                  >
                    {t('consumer.cart.saveVsMarket', 'Save {{amount}} vs market', {
                      amount: fmtMoney((mkt - unitPrice) * item.qty),
                    })}
                  </div>
                ) : null}
              </div>
              <div style={{ textAlign: 'right' }}>
                <QtyStepper
                  value={item.qty}
                  min={0}
                  step={unitStep(item.unit)}
                  integer={!unitAllowsDecimal(item.unit)}
                  onChange={(q) => setQty(idx, q)}
                  labels={{
                    decrease: t('consumer.qty.decrease', 'Decrease quantity'),
                    increase: t('consumer.qty.increase', 'Increase quantity'),
                    quantity: t('consumer.qty.quantity', 'Quantity'),
                  }}
                />
                <div
                  style={{ fontWeight: 700, fontSize: 14, color: 'var(--forest)', marginTop: 4 }}
                >
                  {fmtMoney(lineTotal)}
                </div>
                <button
                  onClick={() => cart.removeAt(idx)}
                  style={{
                    fontSize: 'var(--fs-2xs)',
                    color: 'var(--red)',
                    fontWeight: 700,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    marginTop: 3,
                  }}
                >
                  {t('consumer.cart.remove', 'Remove')}
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Bill summary */}
      <div className="sum-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 10 }}>
          {t('consumer.cart.billSummary', 'Bill Summary')}
        </div>
        {/* The bill is a money COLUMN — every row goes through fmtMoney so the
            figures align and add up on screen exactly as they add up. The unit
            price and the "save" nudges above stay compact on purpose: they are
            prose, not a column. */}
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.itemTotal', 'Item Total')}</span>
          <span className="ival">{fmtMoney(bill.itemSubtotal)}</span>
        </div>
        {/* Every charge keeps its row even at zero. A line that appears only when it
            costs something makes the bill change SHAPE between one basket and the
            next, so a customer cannot learn what they are being charged for — and a
            charge they have never seen listed reads as a surprise the first time it
            does apply. ₹0.00 answers "am I paying this?" outright. */}
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.handling', 'Handling charges')}</span>
          <span className="ival">{fmtMoney(bill.handling)}</span>
        </div>
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.marketFee', 'Multiple Seller Fees')}</span>
          <span className="ival">{fmtMoney(bill.marketFee)}</span>
        </div>
        <div className="irow">
          <span className="ilbl">{t('consumer.cart.delivery', 'Delivery')}</span>
          <span className="ival">
            {bill.delivery === 0 ? (
              <span style={{ color: 'var(--success)', fontWeight: 700 }}>
                {t('consumer.cart.free', 'FREE')}
              </span>
            ) : (
              fmtMoney(bill.delivery)
            )}
          </span>
        </div>
        {/* Distance-priced delivery, itemised: nearby sellers share one charge,
            each farther seller adds their own (see @marutham/lib delivery). */}
        {dq && dq.far.length ? (
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--gray)', marginTop: 2 }}>
            {dq.hasLocal ? (
              <div>
                {t('consumer.cart.deliveryNearby', 'Nearby sellers: {{fee}}', {
                  fee: dq.localFee === 0 ? t('consumer.cart.free', 'FREE') : fmtMoney(dq.localFee),
                })}
              </div>
            ) : null}
            {dq.far.map((f) => (
              <div key={f.farmerId}>
                {t('consumer.cart.deliveryFrom', '{{name}} {{km}}: {{fee}}', {
                  name: sellerName(f.farmerId) || t('consumer.detail.seller', 'Seller'),
                  km:
                    f.distanceKm != null
                      ? `(${fmtKm(f.distanceKm)})`
                      : `(${t('consumer.cart.otherDistrict', 'other district')})`,
                  fee: fmtMoney(f.fee),
                })}
              </div>
            ))}
          </div>
        ) : null}
        {showFreeNudge ? (
          <div style={{ fontSize: 'var(--fs-2xs)', color: 'var(--warning-fg)', marginTop: 2 }}>
            {dq && dq.far.length
              ? t(
                  'consumer.cart.freeNearbyNudge',
                  'Add {{amount}} more from nearby sellers for FREE local delivery',
                  {
                    amount: fmtMoney(FREE_DELIVERY_MIN - localTotal),
                  },
                )
              : t('consumer.cart.freeDeliveryNudge', 'Add {{amount}} more for FREE delivery', {
                  amount: fmtMoney(FREE_DELIVERY_MIN - localTotal),
                })}
          </div>
        ) : null}
        {bill.savings > 0 ? (
          <div className="irow" style={{ color: 'var(--success)', fontWeight: 700 }}>
            <span className="ilbl">🎉 {t('consumer.cart.youSave', 'You Save')}</span>
            <span className="ival">
              {t('consumer.cart.vsGovtRate', '{{amount}} vs Market Rate', {
                amount: fmtMoney(bill.savings),
              })}
            </span>
          </div>
        ) : null}
        <div style={{ borderTop: '2px solid var(--forest-soft)', margin: '10px 0' }} />
        <div className="irow">
          <span className="ilbl" style={{ fontSize: 14, fontWeight: 700, color: 'var(--forest)' }}>
            {t('consumer.cart.grandTotal', 'Grand Total')}
          </span>
          <span className="ival" style={{ fontSize: 16, color: 'var(--forest)' }}>
            {fmtMoney(bill.total)}
          </span>
        </div>
      </div>

      <Checkout bill={bill} onOrderPlaced={onOrderPlaced} onAddressChange={setQuoteAddress} />
    </>
  );
}
