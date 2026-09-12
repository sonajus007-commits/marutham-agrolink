import { useCallback, useEffect, useState, type ComponentType, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton, LangToggle } from '@marutham/ui';
import {
  HomeIcon,
  WalletIcon,
  WheatIcon,
  PackageIcon,
  UserIcon,
  LogOutIcon,
} from '../../components/icons';
import { api } from '@marutham/api-client';
import { isOrderCancelled, needsSubscriptionPayment, type Order } from '@marutham/lib';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider } from '../../components/Toast';
import { EarningsTab } from './EarningsTab';
import { ProductsTab } from './ProductsTab';
import { FarmerOrdersTab } from './FarmerOrdersTab';
import { FarmerHomeTab, type FarmerNavTarget } from './FarmerHomeTab';
import { FarmerProfileTab } from './FarmerProfileTab';
import { SubscriptionGate } from './SubscriptionGate';
import { NotificationBell } from '../../components/NotificationBell';
import './farmer.css';

type Tab = 'home' | 'earnings' | 'products' | 'orders' | 'profile';

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
  const [tab, setTab] = useState<Tab>('home');
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

  /* Desktop sidebar (>=1024px) — the same left-list / right-pane layout the
   * consumer page wears. Only one of the two navigations is visible at a time
   * (CSS hides the bottom nav on desktop, the sidebar on phones), so there is no
   * duplicate tab stop. */
  const navItems: {
    id: Tab;
    Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
    label: string;
    short: string;
    badge?: number;
  }[] = [
    {
      id: 'home',
      Icon: HomeIcon,
      label: t('farmer.nav.home', 'Dashboard'),
      short: t('farmer.navShort.home', 'Home'),
    },
    {
      id: 'earnings',
      Icon: WalletIcon,
      label: t('farmer.nav.earnings', 'Earnings'),
      short: t('farmer.navShort.earnings', 'Earnings'),
    },
    {
      id: 'products',
      Icon: WheatIcon,
      label: t('farmer.nav.products', 'My Products'),
      short: t('farmer.navShort.products', 'Products'),
    },
    {
      id: 'orders',
      Icon: PackageIcon,
      label: t('farmer.nav.orders', 'Orders'),
      short: t('farmer.navShort.orders', 'Orders'),
      badge: packCount,
    },
    {
      id: 'profile',
      Icon: UserIcon,
      label: t('farmer.nav.profile', 'Profile'),
      short: t('farmer.navShort.profile', 'Profile'),
    },
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
          <NotificationBell />
          <LangToggle
            value={i18n.language}
            onChange={(v) => setLang(v as AppLanguage)}
            options={[
              { value: 'en', label: 'EN' },
              { value: 'ta', label: 'த', className: 'tamil' },
            ]}
          />
          <IconButton onClick={logout} aria-label={t('farmer.logout')}>
            <LogOutIcon size={18} />
          </IconButton>
        </div>
      </header>

      <div className="fm-body">
        <nav className="fm-side" aria-label={t('farmer.nav.label', 'Seller sections')}>
          <ul className="fm-side__list">
            {navItems.map((it) => {
              const on = tab === it.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`fm-side__item${on ? ' is-active' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => setTab(it.id)}
                  >
                    <span className="fm-side__icon" aria-hidden="true">
                      <it.Icon size={18} />
                    </span>
                    <span className="fm-side__label">{it.label}</span>
                    {it.badge ? <span className="fm-side__badge">{it.badge}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="fm-side__item fm-side__logout" onClick={logout}>
            <span className="fm-side__icon" aria-hidden="true">
              <LogOutIcon size={18} />
            </span>
            <span className="fm-side__label">{t('farmer.logout')}</span>
          </button>
        </nav>

        <div className="fm-main">
          <div className="fm-hero">
            <div className="fm-hero__icon" aria-hidden="true">
              <WheatIcon size={24} />
            </div>
            <div>
              <h2>
                {t('farmer.welcome')}, {user.fname}!
              </h2>
              <p>{t('farmer.heroSub')}</p>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-3.5">
            {tab === 'home' ? (
              <FarmerHomeTab
                orders={orders}
                ordersLoading={ordersLoading}
                ordersError={ordersError}
                reload={loadOrders}
                onGoTo={(target: FarmerNavTarget) => setTab(target)}
              />
            ) : tab === 'earnings' ? (
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
        </div>
      </div>

      {/* Fixed bottom navigation (phone) — the same native-app pattern as the
          consumer app. Hidden at >=1024px where the sidebar takes over. */}
      <nav className="fm-bottomnav" aria-label={t('farmer.nav.label', 'Seller sections')}>
        {navItems.map((it) => {
          const on = tab === it.id;
          return (
            <button
              key={it.id}
              type="button"
              className={`fm-bnav__item${on ? ' is-active' : ''}`}
              aria-current={on ? 'page' : undefined}
              onClick={() => setTab(it.id)}
            >
              <span className="fm-bnav__icon" aria-hidden="true">
                <it.Icon size={22} />
                {it.badge ? <span className="fm-bnav__badge">{it.badge}</span> : null}
              </span>
              <span className="fm-bnav__label">{it.short}</span>
            </button>
          );
        })}
      </nav>

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
