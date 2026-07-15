import { useMemo, useState } from 'react';
import { FilterChips, Spinner, EmptyState, type ChipOption } from '@marutham/ui';
import {
  filterProducts,
  bestOffer,
  offersForSeller,
  fmtMoney,
  type Product,
  type SellerFilter,
} from '@marutham/lib';
import { useConsumerData } from './ConsumerDataContext';
import { useCart } from './CartContext';
import { useLocations } from '../../hooks/useLocations';
import { ProductCard } from './ProductCard';
import { ProductDetailSheet } from './ProductDetailSheet';
import { useToast } from '../../components/Toast';

const SELLER_OPTIONS: ChipOption[] = [
  { value: 'All', label: 'All Sellers' },
  { value: 'Farmer', label: '🌱 Farm Direct' },
  { value: 'Retailer', label: '🏪 Retail' },
];

export function ShopTab({ onGoToCart }: { onGoToCart: () => void }) {
  const {
    products,
    offersByProduct,
    ratingsMap,
    ratingsByFP,
    district,
    setDistrict,
    loading,
    error,
  } = useConsumerData();
  const cart = useCart();
  const toast = useToast();
  const locations = useLocations();

  const [search, setSearch] = useState('');
  const [seller, setSeller] = useState<SellerFilter>('All');
  const [group, setGroup] = useState('All');
  const [cat, setCat] = useState('All');
  const [sub, setSub] = useState('All');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Tamil Nadu');
  const [detailId, setDetailId] = useState<string | null>(null);

  // Filter chip option lists derived from the catalog.
  const groupOptions = useMemo<ChipOption[]>(() => {
    const gs = [
      'All',
      ...new Set(products.map((p) => p.product_group).filter(Boolean) as string[]),
    ];
    return gs.map((g) => ({ value: g, label: g }));
  }, [products]);

  const catOptions = useMemo<ChipOption[]>(() => {
    const inGroup = group === 'All' ? products : products.filter((p) => p.product_group === group);
    const cs = [...new Set(inGroup.map((p) => p.category).filter(Boolean) as string[])];
    return cs.length > 1
      ? [{ value: 'All', label: 'All' }, ...cs.map((c) => ({ value: c, label: c }))]
      : [];
  }, [products, group]);

  const subOptions = useMemo<ChipOption[]>(() => {
    if (cat === 'All') return [];
    const subs = [
      ...new Set(
        products
          .filter((p) => p.category === cat)
          .map((p) => p.sub_type)
          .filter(Boolean) as string[],
      ),
    ];
    return subs.length > 1
      ? [{ value: 'All', label: 'All' }, ...subs.map((s) => ({ value: s, label: s }))]
      : [];
  }, [products, cat]);

  const filtered = useMemo(
    () => filterProducts(products, offersByProduct, { group, cat, sub, seller, city, search }),
    [products, offersByProduct, group, cat, sub, seller, city, search],
  );

  const cartTotal = cart.items.reduce((s, i) => s + parseFloat(String(i.price || 0)) * i.qty, 0);

  function changeQty(product: Product, nextQty: number) {
    const idx = cart.items.findIndex((i) => i.product_id === product.id);
    if (idx === -1) return;
    const best = bestOffer(offersByProduct[product.id] || [], seller);
    const avail = best?.qty_available != null ? Number(best.qty_available) : Infinity;
    let q = nextQty;
    if (q > avail) {
      q = avail;
      toast(`Only ${avail} ${product.unit || ''} available`, 'er');
    }
    cart.updateQtyAt(idx, q);
  }

  const detailProduct = detailId ? products.find((p) => p.id === detailId) || null : null;
  const detailOffers = detailId ? offersForSeller(offersByProduct[detailId] || [], seller) : [];

  return (
    <>
      <div className="cons-lochero">
        <div className="cons-lochero__label">Fresh From Farms Near You</div>
        <div className="cons-lochero__scope">
          {district}, {state}
        </div>
        <div className="cons-lochero__sub">Same-morning harvest · delivered to your door</div>
      </div>

      {cart.count > 0 ? (
        <div
          className="cart-bar"
          role="button"
          tabIndex={0}
          onClick={onGoToCart}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onGoToCart();
          }}
        >
          <div>
            <span style={{ fontSize: 18 }}>🛒</span>{' '}
            <span className="cart-bar__count">
              {cart.count} item{cart.count === 1 ? '' : 's'} in cart
            </span>
          </div>
          <div className="cart-bar__total">{fmtMoney(cartTotal)}</div>
        </div>
      ) : null}

      <div style={{ position: 'relative' }}>
        <input
          className="cons-input"
          type="text"
          placeholder="🔍  Search products…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search products"
        />
      </div>

      <div>
        <div className="filt-label">Seller</div>
        <FilterChips
          options={SELLER_OPTIONS}
          value={seller}
          onChange={(v) => setSeller(v as SellerFilter)}
          aria-label="Seller filter"
        />
        <div className="filt-label">Group</div>
        <FilterChips
          options={groupOptions}
          value={group}
          onChange={(v) => {
            setGroup(v);
            setCat('All');
            setSub('All');
          }}
          aria-label="Product group"
        />
        {catOptions.length ? (
          <>
            <div className="filt-label">Category</div>
            <FilterChips
              options={catOptions}
              value={cat}
              onChange={(v) => {
                setCat(v);
                setSub('All');
              }}
              aria-label="Category"
            />
          </>
        ) : null}
        {subOptions.length ? (
          <>
            <div className="filt-label">Sub-type</div>
            <FilterChips options={subOptions} value={sub} onChange={setSub} aria-label="Sub-type" />
          </>
        ) : null}

        <div className="filt-label">Location</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select
            className="cons-select"
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label="State"
          >
            {(locations.states.length ? locations.states : ['Tamil Nadu']).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            className="cons-select"
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            aria-label="District"
          >
            {(locations.districtsOf(state).length ? locations.districtsOf(state) : [district]).map(
              (d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ),
            )}
          </select>
        </div>
        <input
          className="cons-input"
          style={{ fontSize: 12, padding: '8px 10px' }}
          type="text"
          placeholder="🔍 Village / city (optional)"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label="Village or city filter"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState>{error}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍">
          {search ? `No products match "${search}".` : 'No products in this category.'}
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              offers={offersByProduct[p.id] || []}
              rating={ratingsMap[p.id]}
              seller={seller}
              cartQty={cart.qtyOfProduct(p.id)}
              onOpenDetail={setDetailId}
              onChangeQty={changeQty}
            />
          ))}
        </div>
      )}

      <ProductDetailSheet
        product={detailProduct}
        offers={detailOffers}
        rating={detailId ? ratingsMap[detailId] : undefined}
        ratingsByFP={ratingsByFP}
        open={!!detailId}
        onClose={() => setDetailId(null)}
        onAdd={cart.addItem}
      />
    </>
  );
}
