import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type PlaceOrderItem } from '@marutham/api-client';
import {
  addressProblemKey,
  addressSummary,
  addressTitle,
  buildAddress,
  defaultAddressIndex,
  validateAddress,
  type AddressObject,
  type CartBill,
  type SavedAddress,
} from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { useCart } from './CartContext';
import { useToast } from '../../components/Toast';
import { AddressFields } from '../../components/AddressFields';
import { PaymentSheet } from './PaymentSheet';

/** "Home: 12, Main St, Pudukkottai, 622001" — the picker's option text. */
function addrLine(a: SavedAddress, i: number): string {
  return `${addressTitle(a, i)}: ${addressSummary(a)}`;
}

export function Checkout({ bill, onOrderPlaced }: { bill: CartBill; onOrderPlaced: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();

  const addrs = (user?.delivery_addresses as SavedAddress[]) || [];
  const defIdx = defaultAddressIndex(addrs);
  const [choice, setChoice] = useState<string>(defIdx === null ? 'profile' : String(defIdx));

  // Ad-hoc "deliver somewhere else" address — not saved to the address book.
  const [na, setNa] = useState<SavedAddress>({
    label: 'Other',
    phone: (user?.phone as string) || '',
  });
  const [naError, setNaError] = useState<string | null>(null);

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
      // Resolve a farmer for every line (items added from the detail sheet already
      // carry one; this backfills any that don't).
      const items: PlaceOrderItem[] = [];
      for (const i of cart.items) {
        let farmerId = i.farmer_id || null;
        if (!farmerId) {
          const res = await api.getListings({ product: i.product_id });
          farmerId = (res.listings || []).find((l) => l.listed)?.farmer_id || null;
        }
        if (!farmerId) {
          toast(
            t(
              'consumer.checkout.noFarmers',
              'Some items have no available farmers. Please remove them.',
            ),
            'er',
          );
          setResolving(false);
          return;
        }
        items.push({ product_id: i.product_id, farmer_id: farmerId, qty: i.qty });
      }

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

      <button className="cons-btn-primary" onClick={proceed} disabled={resolving}>
        {resolving
          ? t('consumer.checkout.checking', 'Checking availability…')
          : `${t('consumer.checkout.proceed', 'Proceed to Pay')} →`}
      </button>

      <PaymentSheet
        open={!!pending}
        bill={bill}
        items={pending?.items || []}
        address={pending?.address || null}
        onClose={() => setPending(null)}
        onPlaced={() => {
          setPending(null);
          cart.clear();
          onOrderPlaced();
        }}
      />
    </div>
  );
}
