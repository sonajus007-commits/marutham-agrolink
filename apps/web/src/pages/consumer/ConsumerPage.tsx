import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar, IconButton, LangToggle } from '@marutham/ui';
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

  const closeOrder = useCallback(() => setOpenOrderId(null), []);

  // A placed order lands in the list the moment the user sees the Orders tab.
  const onOrderPlaced = useCallback(() => {
    void refresh();
    setTab('orders');
  }, [refresh]);

  if (!user) return null;
  const setLang = (lang: AppLanguage) => changeLanguage(lang);

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'home', label: t('consumer.tab.home') },
    { id: 'shop', label: t('consumer.tab.shop') },
    { id: 'cart', label: t('consumer.tab.cart'), badge: cart.count },
    { id: 'orders', label: t('consumer.tab.orders'), badge: activeCount },
  ];

  /* Sidebar (mockup panel 2). Only entries backed by a real feature are here:
   * the mockup also lists Subscriptions (a seller-only feature), Wishlist,
   * Wallet & Points, Notifications and Support, none of which exist yet — same
   * reasoning as the KPI row in HomeTab, which omits them rather than inventing
   * numbers. They arrive in Phase 2 with their backends. */
  const navItems: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: 'home', icon: '🏠', label: t('consumer.nav.dashboard', 'Dashboard') },
    { id: 'shop', icon: '🛒', label: t('consumer.nav.browse', 'Browse Products') },
    { id: 'cart', icon: '🧺', label: t('consumer.nav.cart', 'My Cart'), badge: cart.count },
    { id: 'orders', icon: '📦', label: t('consumer.nav.orders', 'My Orders'), badge: activeCount },
    { id: 'addresses', icon: '📍', label: t('consumer.nav.addresses', 'My Addresses') },
    { id: 'profile', icon: '⚙️', label: t('consumer.nav.account', 'Account Settings') },
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
            👤
          </IconButton>
          <IconButton onClick={logout} aria-label={t('consumer.logout')}>
            ⎋
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
                    onClick={() => setTab(it.id)}
                  >
                    <span className="cons-side__icon" aria-hidden="true">
                      {it.icon}
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
              ⎋
            </span>
            <span className="cons-side__label">{t('consumer.logout')}</span>
          </button>
        </nav>

        <div className="cons-main">
          <div className="cons-hero">
            <div className="cons-hero__icon">🌿</div>
            <div>
              <h2>
                {t('consumer.welcome')}, {user.fname}!
              </h2>
              <p>Fresh vegetables · Same morning harvest</p>
            </div>
          </div>

          <TabBar
            className="cons-tabbar"
            items={tabs}
            active={tab}
            onSelect={(id) => setTab(id as Tab)}
          />

          <div className="flex flex-1 flex-col gap-3 p-3.5">
            {tab === 'profile' ? (
              <ProfileTab />
            ) : tab === 'addresses' ? (
              <AddressBook />
            ) : tab === 'home' ? (
              <HomeTab onOpenOrder={setOpenOrderId} onGoToShop={() => setTab('shop')} />
            ) : tab === 'shop' ? (
              <ShopTab onGoToCart={() => setTab('cart')} />
            ) : tab === 'cart' ? (
              <CartTab onOrderPlaced={onOrderPlaced} />
            ) : (
              <OrdersTab onOpenOrder={setOpenOrderId} />
            )}
          </div>
        </div>
      </div>

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
