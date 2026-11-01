import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type PlaceOrderItem } from '@marutham/api-client';
import {
  addressProblemKey,
  addressSummary,
  addressTitle,
  bestOffer,
  buildAddress,
  defaultAddressIndex,
  fmtMoney,
  mergeCartLines,
  offerConsumerPrice,
  validateAddress,
  type AddressObject,
  type CartBill,
  type CartItem,
  type Order,
  type SavedAddress,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useCart } from './CartContext';
import { useConsumerData } from './ConsumerDataContext';
import { useToast } from '../../components/Toast';
import { AddressFields } from '../../components/AddressFields';
import { PaymentSheet } from './PaymentSheet';

/** "Home: 12, Main St, Pudukkottai, 622001" — the picker's option text. */
function addrLine(a: SavedAddress, i: number): string {
  return `${addressTitle(a, i)}: ${addressSummary(a)}`;
}

export function Checkout({
  bill,
  onOrderPlaced,
  onAddressChange,
}: {
  bill: CartBill;
  onOrderPlaced: (order: Order) => void;
  /** The address delivery is priced to, whenever the pick changes (null = profile). */
  onAddressChange?: (address: Record<string, unknown> | null) => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const { offersByProduct } = useConsumerData();

  const addrs = (user?.delivery_addresses as SavedAddress[]) || [];
  const defIdx = defaultAddressIndex(addrs);
  const [choice, setChoice] = useState<string>(defIdx === null ? 'profile' : String(defIdx));

  // Ad-hoc "deliver somewhere else" address — not saved to the address book.
  const [na, setNa] = useState<SavedAddress>({
    label: 'Other',
    phone: (user?.phone as string) || '',
  });
  const [naError, setNaError] = useState<string | null>(null);

  // Delivery is priced by distance to the chosen address, so the bill follows the pick.
  useEffect(() => {
    if (!onAddressChange) return;
    if (choice === 'profile') onAddressChange(null);
    else if (choice === 'new') onAddressChange(na as Record<string, unknown>);
    else onAddressChange((addrs[parseInt(choice)] as Record<string, unknown>) || null);
    // `addrs` is re-derived each render from the user; its content is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice, na, onAddressChange]);

  const [pending, setPending] = useState<{
    items: PlaceOrderItem[];
    address: Record<string, unknown> | null;
  } | null>(null);
  const [resolving, setResolving] = useState(false);

  function collectNewAddress(): Record<string, unknown> | null {
    const problem = validateAddress(na);
    if (problem) {
      // The code becomes a sentence here — lib returns the fault, this screen
      // speaks it, in whichever language the screen is in.
      const message = t(addressProblemKey(problem));
      setNaError(message);
      toast(message, 'er');
      return null;
    }
    setNaError(null);
    return { ...na, label: na.label?.trim() || 'Other' } as Record<string, unknown>;
  }

  async function proceed() {
    if (cart.items.length === 0) {
      toast(t('consumer.cart.empty', 'Your cart is empty.'), 'er');
      return;
    }
    setResolving(true);
    try {
      // Give every line a seller. Portal lines already have one. A public-shop line has
      // only a reference price, so it takes the best offer near the buyer, else any
      // live offer, and that offer's real price. The line is rewritten, so the bill the
      // customer sees before paying is the one the server will charge.
      const lines: CartItem[] = [];
      let repriced = false;
      for (const i of cart.items) {
        if (i.farmer_id) {
          lines.push(i);
          continue;
        }
        const offer =
          bestOffer(offersByProduct[i.product_id] || []) ||
          (await api.getListings({ product: i.product_id })).listings?.find((l) => l.listed);
        const farmer = offer?.farmer;
        const farmerId = farmer?.id || offer?.farmer_id || null;
        if (!offer || !farmerId) {
          toast(
            t('consumer.checkout.noOffer', '{{name}} is not available today. Please remove it.', {
              name: i.product_name,
            }),
            'er',
          );
          setResolving(false);
          return;
        }
        const price = offerConsumerPrice(offer);
        if (price !== i.price) repriced = true;
        lines.push({
          ...i,
          price,
          farmer_id: farmerId,
          farmer_name: farmer
            ? (farmer.fname || '') + (farmer.lname ? ' ' + farmer.lname : '')
            : '',
          listing_id: offer.id || null,
          farmer_price_rs: parseFloat(String(offer.farmer_price)),
        });
      }
      const resolved = mergeCartLines(lines);
      if (
        resolved.some((l, idx) => l !== cart.items[idx]) ||
        resolved.length !== cart.items.length
      ) {
        cart.replaceItems(resolved);
      }
      if (repriced) {
        toast(t('consumer.checkout.repriced', 'Prices updated to today’s offers.'), 'nfo');
      }
      const items: PlaceOrderItem[] = resolved.map((l) => ({
        product_id: l.product_id,
        farmer_id: l.farmer_id as string,
        qty: l.qty,
      }));

      let address: Record<string, unknown> | null = null;
      if (choice === 'new') {
        address = collectNewAddress();
        if (!address) {
          setResolving(false);
          return;
        }
      } else if (choice !== 'profile') {
        address = (addrs[parseInt(choice)] as Record<string, unknown>) || null;
      }
      setPending({ items, address });
    } finally {
      setResolving(false);
    }
  }

  const profileText = user ? buildAddress(user as AddressObject) : '';

  return (
    <div>
      <div className="fg">
        <label className="fl" htmlFor="checkout-addr">
          {t('consumer.checkout.deliveryAddress', 'Delivery Address')} <span className="rq">*</span>
        </label>
        <select
          id="checkout-addr"
          className="cons-select"
          style={{ padding: '10px 12px', fontSize: 13 }}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
        >
          {addrs.map((a, i) => (
            <option key={i} value={String(i)}>
              {addrLine(a, i)}
            </option>
          ))}
          <option value="profile">
            📍 {t('consumer.checkout.profileAddress', 'Profile address')}
          </option>
          <option value="new">
            ➕ {t('consumer.checkout.otherAddress', 'Deliver to a different address…')}
          </option>
        </select>

        {choice !== 'new' ? (
          <div
            style={{
              fontSize: 11,
              color: 'var(--forest)',
              lineHeight: 1.55,
              marginTop: 6,
              padding: '9px 11px',
              background: 'var(--tint-50)',
              border: '1px solid var(--surface-muted)',
              borderRadius: 9,
            }}
          >
            📦 <b>{t('consumer.checkout.deliverTo', 'Deliver to:')}</b>{' '}
            {choice === 'profile'
              ? profileText ||
                `⚠️ ${t('consumer.checkout.noProfileAddress', 'No profile address on file — add one in the Profile tab.')}`
              : addrLine(addrs[parseInt(choice)] || {}, parseInt(choice))}
          </div>
        ) : (
          <div
            style={{
              marginTop: 8,
              border: '1px dashed var(--tint-400)',
              borderRadius: 10,
              padding: 12,
            }}
          >
            <AddressFields value={na} onChange={setNa} showPhone showPin error={naError} />
          </div>
        )}
      </div>

      {/* The Proceed CTA rides a bar pinned above the bottom nav so it stays
          thumb-reachable however long the cart + address block scrolls; the
          spacer reserves its height so the last field never hides behind it.
          On desktop the bar falls back to an inline card (see consumer.css). */}
      <div className="cons-checkoutbar__spacer" aria-hidden="true" />
      <div className="cons-checkoutbar">
        <div className="cons-checkoutbar__total">
          <span className="k">{t('consumer.cart.grandTotal', 'Grand Total')}</span>
          <span className="v">{fmtMoney(bill.total)}</span>
        </div>
        <button className="cons-btn-primary" onClick={proceed} disabled={resolving}>
          {resolving
            ? t('consumer.checkout.checking', 'Checking availability…')
            : `${t('consumer.checkout.proceed', 'Proceed to Pay')} →`}
        </button>
      </div>

      <PaymentSheet
        open={!!pending}
        bill={bill}
        items={pending?.items || []}
        address={pending?.address || null}
        onClose={() => setPending(null)}
        onPlaced={(order) => {
          setPending(null);
          cart.clear();
          onOrderPlaced(order);
        }}
      />
    </div>
  );
}
