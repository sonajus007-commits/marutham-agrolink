import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar, IconButton, LangToggle } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { isOrderCancelled, needsSubscriptionPayment, type Order } from '@marutham/lib';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider } from '../../components/Toast';
import { EarningsTab } from './EarningsTab';
import { ProductsTab } from './ProductsTab';
import { FarmerOrdersTab } from './FarmerOrdersTab';
import { FarmerProfileTab } from './FarmerProfileTab';
import { SubscriptionGate } from './SubscriptionGate';
import './farmer.css';

type Tab = 'earnings' | 'products' | 'orders' | 'profile';

export function FarmerPage() {
  return (
    <ToastProvider>
      <FarmerInner />
    </ToastProvider>
  );
}

function FarmerInner() {
  const { t, i18n } = useTranslation();
  const { user, logout, updateUser } = useAuth();
  const [tab, setTab] = useState<Tab>('earnings');
  const [renewing, setRenewing] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const suspended = !!user && needsSubscriptionPayment(user);

  /* The orders list lives here, not in the Orders tab, so the tab badge can show
   * the pending-pack count even while another tab is open and stay in sync after
   * the seller packs an order. */
  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const res = await api.getOrders();
      setOrders(res.orders || []);
    } catch (e) {
      setOrdersError(
        e instanceof Error ? e.message : t('consumer.orders.loadFailed', 'Could not load orders'),
      );
    } finally {
      setOrdersLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  /* Orders sitting at "Order Placed" are the ones the seller still has to pack. */
  const packCount = orders.filter(
    (o) => !isOrderCancelled(o) && String(o.status ?? '') === 'Order Placed',
  ).length;

  /* Re-read the account from the server on mount: an admin may have suspended
   * or reinstated this seller since the cached session was written. */
  useEffect(() => {
    let active = true;
    api
      .me()
      .then((res) => active && updateUser(res.user))
      .catch(() => {
        /* requireAuth rejects blocked/rejected sellers — AuthContext ends the session. */
      });
    // Guard against a late response landing after unmount — without this the
    // `active` flag never flips and the updateUser() above could fire on a gone
    // component.
    return () => {
      active = false;
    };
  }, [updateUser]);

  const onPaid = useCallback(() => setRenewing(false), []);

  if (!user) return null;
  const setLang = (lang: AppLanguage) => changeLanguage(lang);

  const tabs = [
    { id: 'earnings', label: t('farmer.tab.earnings') },
    { id: 'products', label: t('farmer.tab.products') },
    { id: 'orders', label: t('farmer.tab.orders'), badge: packCount || undefined },
    { id: 'profile', label: t('farmer.tab.profile') },
  ];

  return (
    <div className="fm-shell">
      <header className="fm-hdr">
        <a href="/app/farmer" className="fm-hdr__brand">
          <img className="fm-hdr__logo" src="/img/logo-sm.jpg" alt="Marutham Agrolink" />
          <div>
            <div className="fm-hdr__name">
              Marutham <span>Agrolink</span>
            </div>
            <div className="fm-hdr__tag">
              {t(user.seller_type === 'Retailer' ? 'farmer.tagRetailer' : 'farmer.tag')}
            </div>
          </div>
        </a>
        <div className="fm-hdr__right">
          <LangToggle
            value={i18n.language}
            onChange={(v) => setLang(v as AppLanguage)}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'ta', label: 'த', className: 'tamil' },
            ]}
          />
          <IconButton onClick={logout} aria-label={t('farmer.logout')}>
            ⎋
          </IconButton>
        </div>
      </header>

      <div className="fm-hero">
        <div className="fm-hero__icon" aria-hidden="true">
          🌾
        </div>
        <div>
          <h2>
            {t('farmer.welcome')}, {user.fname}!
          </h2>
          <p>{t('farmer.heroSub')}</p>
        </div>
      </div>

      <TabBar items={tabs} active={tab} onSelect={(id) => setTab(id as Tab)} />

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {tab === 'earnings' ? (
          <EarningsTab onRenew={() => setRenewing(true)} />
        ) : tab === 'products' ? (
          <ProductsTab />
        ) : tab === 'orders' ? (
          <FarmerOrdersTab
            orders={orders}
            loading={ordersLoading}
            error={ordersError}
            reload={loadOrders}
          />
        ) : (
          <FarmerProfileTab onRenew={() => setRenewing(true)} />
        )}
      </div>

      {/* A suspended seller gets the blocking gate; anyone else can open it to renew. */}
      <SubscriptionGate
        open={suspended || renewing}
        blocking={suspended}
        onClose={() => setRenewing(false)}
        onPaid={onPaid}
      />
    </div>
  );
}
