import { QtyStepper, EmptyState } from '@marutham/ui';
import {
  cartBill, bestOffer, getProductEmoji, unitStep, unitAllowsDecimal,
  type Offer,
} from '@marutham/lib';
import { useConsumerData } from './ConsumerDataContext';
import { useCart } from './CartContext';
import { useToast } from '../../components/Toast';
import { Checkout } from './Checkout';

function offerAvailable(offers: Offer[], listingId?: string | null): number {
  const o = listingId ? offers.find((x) => x.id === listingId) : bestOffer(offers, 'All');
  return o && o.qty_available != null ? Number(o.qty_available) : Infinity;
}

export function CartTab({ onOrderPlaced }: { onOrderPlaced: () => void }) {
  const { productById, offersByProduct } = useConsumerData();
  const cart = useCart();
  const toast = useToast();

  if (cart.items.length === 0) {
    return <EmptyState icon="🛒">Your cart is empty.<br />Browse the shop to add items.</EmptyState>;
  }

  const bill = cartBill(cart.items, productById);

  function setQty(index: number, next: number) {
    const item = cart.items[index];
    const avail = offerAvailable(offersByProduct[item.product_id] || [], item.listing_id);
    let q = next;
    if (q > avail) {
      q = avail;
      toast(`Only ${avail} ${item.unit || ''} available`, 'er');
    }
    cart.updateQtyAt(index, q);
  }

  return (
    <>
      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--forest)' }}>🛒 Your Cart</div>

      {cart.items.map((item, idx) => {
        const p = productById[item.product_id] || {};
        const dp = p.district_price;
        const unitPrice = parseFloat(String(item.price));
        const lineTotal = unitPrice * item.qty;
        const mkt = dp ? parseFloat(String(dp.market_price)) : 0;
        return (
          <div key={idx} className="prod-card" style={{ padding: '12px 14px' }}>
            <div className="cart-line">
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg,#e8f5e9,#f1f8e9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0 }}>
                {getProductEmoji(item.product_name)}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--forest)' }}>{item.product_name}</div>
                {item.farmer_name ? <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 2 }}>from {item.farmer_name}</div> : null}
                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>₹{unitPrice.toFixed(0)} / {item.unit}</div>
                {mkt > 0 && unitPrice < mkt ? (
                  <div style={{ fontSize: 9, color: '#1a7a4a', fontWeight: 700, marginTop: 2 }}>Save ₹{Math.round((mkt - unitPrice) * item.qty)} vs market</div>
                ) : null}
              </div>
              <div style={{ textAlign: 'right' }}>
                <QtyStepper value={item.qty} min={0} step={unitStep(item.unit)} integer={!unitAllowsDecimal(item.unit)} onChange={(q) => setQty(idx, q)} />
                <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--forest)', marginTop: 4 }}>₹{lineTotal.toFixed(0)}</div>
                <button onClick={() => cart.removeAt(idx)} style={{ fontSize: 10, color: 'var(--red)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', marginTop: 3 }}>
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {/* Bill summary */}
      <div className="sum-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--forest)', marginBottom: 10 }}>Bill Summary</div>
        <div className="irow"><span className="ilbl">Item Total</span><span className="ival">₹{bill.itemSubtotal.toFixed(0)}</span></div>
        {bill.handling > 0 ? <div className="irow"><span className="ilbl">Handling charges</span><span className="ival">₹{bill.handling.toFixed(0)}</span></div> : null}
        {bill.marketFee > 0 ? <div className="irow"><span className="ilbl">Market fee (multiple farmers)</span><span className="ival">₹{bill.marketFee.toFixed(0)}</span></div> : null}
        <div className="irow"><span className="ilbl">Delivery</span><span className="ival">{bill.delivery === 0 ? <span style={{ color: '#1a7a4a', fontWeight: 700 }}>FREE</span> : `₹${bill.delivery.toFixed(0)}`}</span></div>
        {bill.itemSubtotal > 0 && bill.itemSubtotal < 150 ? (
          <div style={{ fontSize: 10, color: '#c2620a', marginTop: 2 }}>Add ₹{(150 - bill.itemSubtotal).toFixed(0)} more for FREE delivery</div>
        ) : null}
        {bill.savings > 0 ? (
          <div className="irow" style={{ color: '#1a7a4a', fontWeight: 700 }}><span className="ilbl">🎉 You Save</span><span className="ival">₹{bill.savings.toFixed(0)} vs Govt Rate</span></div>
        ) : null}
        <div style={{ borderTop: '2px solid #2d6a4f', margin: '10px 0' }} />
        <div className="irow"><span className="ilbl" style={{ fontSize: 14, fontWeight: 700, color: 'var(--forest)' }}>Grand Total</span><span className="ival" style={{ fontSize: 16, color: 'var(--forest)' }}>₹{bill.total.toFixed(0)}</span></div>
      </div>

      <Checkout bill={bill} onOrderPlaced={onOrderPlaced} />
    </>
  );
}
