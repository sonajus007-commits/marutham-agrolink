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
import './consumer.css';

/* 'profile' is reachable from the header 👤 button, not the nav bar — a fifth
 * nav tab does not fit a 420px phone. Matches the legacy consumer page. */
type Tab = 'home' | 'shop' | 'cart' | 'orders' | 'profile';

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

      <div className="cons-hero">
        <div className="cons-hero__icon">🌿</div>
        <div>
          <h2>
            {t('consumer.welcome')}, {user.fname}!
          </h2>
          <p>Fresh vegetables · Same morning harvest</p>
        </div>
      </div>

      <TabBar items={tabs} active={tab} onSelect={(id) => setTab(id as Tab)} />

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {tab === 'profile' ? (
          <ProfileTab />
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
