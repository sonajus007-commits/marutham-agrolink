import { useState } from 'react';
import { api, type PlaceOrderItem } from '@marutham/api-client';
import {
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
      setNaError(problem);
      toast(problem, 'er');
      return null;
    }
    setNaError(null);
    return { ...na, label: na.label?.trim() || 'Other' } as Record<string, unknown>;
  }

  async function proceed() {
    if (cart.items.length === 0) {
      toast('Your cart is empty.', 'er');
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
          toast('Some items have no available farmers. Please remove them.', 'er');
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
          Delivery Address <span className="rq">*</span>
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
          <option value="profile">📍 Profile address</option>
          <option value="new">➕ Deliver to a different address…</option>
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
            📦 <b>Deliver to:</b>{' '}
            {choice === 'profile'
              ? profileText || '⚠️ No profile address on file — add one in the Profile tab.'
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
            <AddressFields value={na} onChange={setNa} showPhone error={naError} />
          </div>
        )}
      </div>

      <button className="cons-btn-primary" onClick={proceed} disabled={resolving}>
        {resolving ? 'Checking availability…' : 'Proceed to Pay →'}
      </button>

      <PaymentSheet
        open={!!pending}
        amount={bill.total}
        items={pending?.items || []}
        address={pending?.address || null}
        deliveryFee={bill.delivery}
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
