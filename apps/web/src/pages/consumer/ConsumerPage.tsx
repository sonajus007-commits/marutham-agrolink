import { useCallback, useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, LangToggle } from '@marutham/ui';
import {
  HomeIcon,
  BagIcon,
  CartIcon,
  PackageIcon,
  MapPinIcon,
  SettingsIcon,
  UserIcon,
  LogOutIcon,
  LeafIcon,
} from '../../components/icons';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider } from '../../components/Toast';
import { CartProvider, useCart } from './CartContext';
import { ConsumerDataProvider } from './ConsumerDataContext';
import { OrdersProvider, useOrders } from './OrdersContext';
import { ShopTab } from './ShopTab';
import { CartTab } from './CartTab';
import { HomeTab } from './HomeTab';
import { OrdersTab } from './OrdersTab';
import { OrderDetailSheet } from './OrderDetailSheet';
import { ProfileTab } from './ProfileTab';
import { AddressBook } from './AddressBook';
import { NotificationBell } from '../../components/NotificationBell';
import './consumer.css';

/* 'profile' is reachable from the header 👤 button, not the nav bar — a fifth
 * nav tab does not fit a 420px phone. Matches the legacy consumer page.
 * 'addresses' is sidebar-only for the same reason: on a phone it stays where it
 * has always been, inside ProfileTab. */
type Tab = 'home' | 'shop' | 'cart' | 'orders' | 'addresses' | 'profile';

export function ConsumerPage() {
  return (
    <ToastProvider>
      <CartProvider>
        <ConsumerDataProvider>
          <OrdersProvider>
            <ConsumerInner />
          </OrdersProvider>
        </ConsumerDataProvider>
      </CartProvider>
    </ToastProvider>
  );
}

function ConsumerInner() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const cart = useCart();
  const { activeCount, refresh } = useOrders();
  const [tab, setTab] = useState<Tab>('home');
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  // Seed carried from the Home storefront (search box / category rail) into the
  // Shop tab. `nonce` bumps on every hand-off so the Shop remounts with the new
  // initial filter; navigating to Shop from the nav clears it back to the full
  // catalogue.
  const [shopSeed, setShopSeed] = useState<{ search: string; group: string; nonce: number }>({
    search: '',
    group: 'All',
    nonce: 0,
  });

  const closeOrder = useCallback(() => setOpenOrderId(null), []);

  // Tab switch used by the nav rail and tab bar. Selecting Shop directly resets
  // any storefront filter so the buyer sees the whole catalogue.
  const selectTab = useCallback((id: Tab) => {
    if (id === 'shop') {
      setShopSeed((s) =>
        s.search || s.group !== 'All' ? { search: '', group: 'All', nonce: s.nonce + 1 } : s,
      );
    }
    setTab(id);
  }, []);

  const goShopSearch = useCallback((query: string) => {
    setShopSeed((s) => ({ search: query, group: 'All', nonce: s.nonce + 1 }));
    setTab('shop');
  }, []);
  const goShopCategory = useCallback((group: string) => {
    setShopSeed((s) => ({ search: '', group, nonce: s.nonce + 1 }));
    setTab('shop');
  }, []);

  /* Deep-link intent from the public shop's cart. When a shopper hits "Proceed
   * to checkout" on the Next /cart, it drops a one-shot `ma_intent_tab` flag and
   * hands off here (directly if signed in, or via sign-in). Read it once on
   * mount and open the matching tab, so they land on their cart rather than the
   * consumer home. Same-origin localStorage, so it survives the login redirect. */
  useEffect(() => {
    let intent: string | null = null;
    try {
      intent = localStorage.getItem('ma_intent_tab');
      if (intent) localStorage.removeItem('ma_intent_tab');
    } catch {
      /* storage disabled — just start on home */
    }
    if (intent === 'cart') setTab('cart');
  }, []);

  // A placed order lands in the list the moment the user sees the Orders tab.
  const onOrderPlaced = useCallback(() => {
    void refresh();
    setTab('orders');
  }, [refresh]);

  if (!user) return null;
  const setLang = (lang: AppLanguage) => changeLanguage(lang);

  // Fixed bottom navigation (phone) — the native-app pattern from the reference
  // mockup: five icon+label tabs, Account included so profile is one tap away.
  const bottomNav: {
    id: Tab;
    Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
    label: string;
    badge?: number;
  }[] = [
    { id: 'home', Icon: HomeIcon, label: t('consumer.tab.homeShort', 'Home') },
    { id: 'shop', Icon: BagIcon, label: t('consumer.tab.shopShort', 'Shop') },
    { id: 'cart', Icon: CartIcon, label: t('consumer.tab.cartShort', 'Cart'), badge: cart.count },
    {
      id: 'orders',
      Icon: PackageIcon,
      label: t('consumer.tab.ordersShort', 'Orders'),
      badge: activeCount,
    },
    { id: 'profile', Icon: UserIcon, label: t('consumer.tab.accountShort', 'Account') },
  ];

  /* Sidebar (mockup panel 2). Only entries backed by a real feature are here:
   * the mockup also lists Subscriptions (a seller-only feature), Wishlist,
   * Wallet & Points, Notifications and Support, none of which exist yet — same
   * reasoning as the KPI row in HomeTab, which omits them rather than inventing
   * numbers. They arrive in Phase 2 with their backends. */
  const navItems: {
    id: Tab;
    Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
    label: string;
    badge?: number;
  }[] = [
    { id: 'home', Icon: HomeIcon, label: t('consumer.nav.dashboard', 'Dashboard') },
    { id: 'shop', Icon: BagIcon, label: t('consumer.nav.browse', 'Browse Products') },
    { id: 'cart', Icon: CartIcon, label: t('consumer.nav.cart', 'My Cart'), badge: cart.count },
    {
      id: 'orders',
      Icon: PackageIcon,
      label: t('consumer.nav.orders', 'My Orders'),
      badge: activeCount,
    },
    { id: 'addresses', Icon: MapPinIcon, label: t('consumer.nav.addresses', 'My Addresses') },
    { id: 'profile', Icon: SettingsIcon, label: t('consumer.nav.account', 'Account Settings') },
  ];

  return (
    <div className="cons-shell">
      <header className="cons-hdr">
        <a href="/app/consumer" className="cons-hdr__brand">
          <div className="hring" style={{ width: 42, height: 32 }}>
            <img
              src="/img/logo-sm.jpg"
              alt="MA"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <div className="cons-hdr__name">
              Marutham <span>Agrolink</span>
            </div>
            <div className="cons-hdr__tag">{t('consumer.tag')}</div>
          </div>
        </a>
        <div className="cons-hdr__right">
          <NotificationBell />
          <LangToggle
            value={i18n.language}
            onChange={(v) => setLang(v as AppLanguage)}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'ta', label: 'த', className: 'tamil' },
            ]}
          />
          <IconButton
            active={tab === 'profile'}
            onClick={() => setTab(tab === 'profile' ? 'home' : 'profile')}
            aria-pressed={tab === 'profile'}
            aria-label={t('consumer.profile')}
            title={t('consumer.profile')}
          >
            <UserIcon size={18} />
          </IconButton>
          <IconButton onClick={logout} aria-label={t('consumer.logout')}>
            <LogOutIcon size={18} />
          </IconButton>
        </div>
      </header>

      <div className="cons-body">
        <nav className="cons-side" aria-label={t('consumer.nav.label', 'Consumer sections')}>
          <ul className="cons-side__list">
            {navItems.map((it) => {
              const on = tab === it.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`cons-side__item${on ? ' is-active' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => selectTab(it.id)}
                  >
                    <span className="cons-side__icon" aria-hidden="true">
                      <it.Icon size={18} />
                    </span>
                    <span className="cons-side__label">{it.label}</span>
                    {it.badge ? <span className="cons-side__badge">{it.badge}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="cons-side__item cons-side__logout" onClick={logout}>
            <span className="cons-side__icon" aria-hidden="true">
              <LogOutIcon size={18} />
            </span>
            <span className="cons-side__label">{t('consumer.logout')}</span>
          </button>
        </nav>

        <div className="cons-main">
          {/* The storefront Home carries its own hero; the greeting card only
              shows on the other tabs, where it isn't competing with it. */}
          {tab !== 'home' ? (
            <div className="cons-hero">
              <div className="cons-hero__icon">
                <LeafIcon size={24} />
              </div>
              <div>
                <h2>
                  {t('consumer.welcome')}, {user.fname}!
                </h2>
                <p>{t('consumer.heroSub', 'Fresh vegetables · Same morning harvest')}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-1 flex-col gap-3 p-3.5">
            {tab === 'profile' ? (
              <ProfileTab />
            ) : tab === 'addresses' ? (
              <AddressBook />
            ) : tab === 'home' ? (
              <HomeTab
                onOpenOrder={setOpenOrderId}
                onGoToShop={() => selectTab('shop')}
                onGoToOrders={() => setTab('orders')}
                onGoToCart={() => setTab('cart')}
                onGoToAddresses={() => setTab('addresses')}
                onSearch={goShopSearch}
                onPickCategory={goShopCategory}
              />
            ) : tab === 'shop' ? (
              <ShopTab
                key={`shop-${shopSeed.nonce}`}
                initialSearch={shopSeed.search}
                initialGroup={shopSeed.group}
                onGoToCart={() => setTab('cart')}
              />
            ) : tab === 'cart' ? (
              <CartTab onOrderPlaced={onOrderPlaced} />
            ) : (
              <OrdersTab onOpenOrder={setOpenOrderId} />
            )}
          </div>
        </div>
      </div>

      {/* Fixed bottom navigation (phone), like a native shopping app. Hidden at
          >=1024px where the sidebar takes over. Account (profile) rides here too,
          so it is reachable without hunting for the header icon. */}
      <nav className="cons-bottomnav" aria-label={t('consumer.nav.label', 'Consumer sections')}>
        {bottomNav.map((it) => {
          const on = tab === it.id;
          return (
            <button
              key={it.id}
              type="button"
              className={`cons-bnav__item${on ? ' is-active' : ''}`}
              aria-current={on ? 'page' : undefined}
              onClick={() => selectTab(it.id)}
            >
              <span className="cons-bnav__icon" aria-hidden="true">
                <it.Icon size={22} />
                {it.badge ? <span className="cons-bnav__badge">{it.badge}</span> : null}
              </span>
              <span className="cons-bnav__label">{it.label}</span>
            </button>
          );
        })}
      </nav>

      <OrderDetailSheet
        orderId={openOrderId}
        open={openOrderId !== null}
        onClose={closeOrder}
        onOrderChanged={refresh}
        onGoToCart={() => setTab('cart')}
      />
    </div>
  );
}
