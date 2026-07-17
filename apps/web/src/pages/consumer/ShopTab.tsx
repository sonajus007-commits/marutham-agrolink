import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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

export function ShopTab({ onGoToCart }: { onGoToCart: () => void }) {
  const { t } = useTranslation();
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

  const sellerOptions = useMemo<ChipOption[]>(
    () => [
      { value: 'All', label: t('consumer.shop.allSellers', 'All Sellers') },
      { value: 'Farmer', label: `🌱 ${t('consumer.shop.farmDirect', 'Farm Direct')}` },
      { value: 'Retailer', label: `🏪 ${t('consumer.shop.retail', 'Retail')}` },
    ],
    [t],
  );

  /* Only the "All" chip is translated. Every other label is a product_group /
   * category / sub_type straight out of the DB — data, not copy, and an open set
   * (10 categories today, added by whoever adds a product). Translating those
   * belongs in the taxonomy, not in a screen. `value` is untouched either way:
   * 'All' is the sentinel filterProducts compares against, so a translated value
   * would filter the catalogue down to nothing. */
  const allLabel = t('common.all', 'All');

  // Filter chip option lists derived from the catalog.
  const groupOptions = useMemo<ChipOption[]>(() => {
    const gs = [
      'All',
      ...new Set(products.map((p) => p.product_group).filter(Boolean) as string[]),
    ];
    return gs.map((g) => ({ value: g, label: g === 'All' ? allLabel : g }));
  }, [products, allLabel]);

  const catOptions = useMemo<ChipOption[]>(() => {
    const inGroup = group === 'All' ? products : products.filter((p) => p.product_group === group);
    const cs = [...new Set(inGroup.map((p) => p.category).filter(Boolean) as string[])];
    return cs.length > 1
      ? [{ value: 'All', label: allLabel }, ...cs.map((c) => ({ value: c, label: c }))]
      : [];
  }, [products, group, allLabel]);

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
      ? [{ value: 'All', label: allLabel }, ...subs.map((s) => ({ value: s, label: s }))]
      : [];
  }, [products, cat, allLabel]);

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
      toast(
        t('consumer.shop.onlyAvailable', 'Only {{qty}} {{unit}} available', {
          qty: avail,
          unit: product.unit || '',
        }).trim(),
        'er',
      );
    }
    cart.updateQtyAt(idx, q);
  }

  const detailProduct = detailId ? products.find((p) => p.id === detailId) || null : null;
  const detailOffers = detailId ? offersForSeller(offersByProduct[detailId] || [], seller) : [];

  return (
    <>
      <div className="cons-lochero">
        <div className="cons-lochero__label">
          {t('consumer.shop.heroLabel', 'Fresh From Farms Near You')}
        </div>
        <div className="cons-lochero__scope">
          {district}, {state}
        </div>
        <div className="cons-lochero__sub">
          {t('consumer.shop.heroSub', 'Same-morning harvest · delivered to your door')}
        </div>
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
            {/* i18next owns the plural: "item"/"items" is an English rule, and the
                two languages do not split at the same place. */}
            <span className="cart-bar__count">
              {t('consumer.shop.cartItems', { count: cart.count })}
            </span>
          </div>
          <div className="cart-bar__total">{fmtMoney(cartTotal)}</div>
        </div>
      ) : null}

      <div style={{ position: 'relative' }}>
        <input
          className="cons-input"
          type="text"
          placeholder={`🔍  ${t('consumer.shop.searchPlaceholder', 'Search products…')}`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('consumer.shop.searchAria', 'Search products')}
        />
      </div>

      <div>
        <div className="filt-label">{t('consumer.shop.filter.seller', 'Seller')}</div>
        <FilterChips
          options={sellerOptions}
          value={seller}
          onChange={(v) => setSeller(v as SellerFilter)}
          aria-label={t('consumer.shop.filter.sellerAria', 'Seller filter')}
        />
        <div className="filt-label">{t('consumer.shop.filter.group', 'Group')}</div>
        <FilterChips
          options={groupOptions}
          value={group}
          onChange={(v) => {
            setGroup(v);
            setCat('All');
            setSub('All');
          }}
          aria-label={t('consumer.shop.filter.groupAria', 'Product group')}
        />
        {catOptions.length ? (
          <>
            <div className="filt-label">{t('consumer.shop.filter.category', 'Category')}</div>
            <FilterChips
              options={catOptions}
              value={cat}
              onChange={(v) => {
                setCat(v);
                setSub('All');
              }}
              aria-label={t('consumer.shop.filter.categoryAria', 'Category')}
            />
          </>
        ) : null}
        {subOptions.length ? (
          <>
            <div className="filt-label">{t('consumer.shop.filter.subType', 'Sub-type')}</div>
            <FilterChips
              options={subOptions}
              value={sub}
              onChange={setSub}
              aria-label={t('consumer.shop.filter.subTypeAria', 'Sub-type')}
            />
          </>
        ) : null}

        <div className="filt-label">{t('consumer.shop.filter.location', 'Location')}</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select
            className="cons-select"
            value={state}
            onChange={(e) => setState(e.target.value)}
            aria-label={t('consumer.shop.filter.state', 'State')}
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
            aria-label={t('consumer.shop.filter.district', 'District')}
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
          placeholder={`🔍 ${t('consumer.shop.villagePlaceholder', 'Village / city (optional)')}`}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label={t('consumer.shop.filter.villageAria', 'Village or city filter')}
        />
      </div>

      {loading ? (
        <Spinner />
      ) : error ? (
        <EmptyState>{error}</EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍">
          {search
            ? t('consumer.shop.noMatch', 'No products match "{{query}}".', { query: search })
            : t('consumer.shop.noProducts', 'No products in this category.')}
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
