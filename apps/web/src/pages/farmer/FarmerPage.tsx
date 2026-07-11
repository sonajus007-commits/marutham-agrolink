import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, TabBar, IconButton, LangToggle } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { needsSubscriptionPayment } from '@marutham/lib';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider } from '../../components/Toast';
import { EarningsTab } from './EarningsTab';
import { ProductsTab } from './ProductsTab';
import { SubscriptionGate } from './SubscriptionGate';
import './farmer.css';

/* 3B and 3C fill in Products and Orders. */
type Tab = 'earnings' | 'products' | 'orders';

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

  const suspended = !!user && needsSubscriptionPayment(user);

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
  }, [updateUser]);

  const onPaid = useCallback(() => setRenewing(false), []);

  if (!user) return null;
  const setLang = (lang: AppLanguage) => changeLanguage(lang);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'earnings', label: t('farmer.tab.earnings') },
    { id: 'products', label: t('farmer.tab.products') },
    { id: 'orders', label: t('farmer.tab.orders') },
  ];

  return (
    <div className="fm-shell">
      <header className="fm-hdr">
        <a href="/app/farmer" className="fm-hdr__brand">
          <img className="fm-hdr__logo" src="/img/logo-sm.jpg" alt="Marutham Agrolink" />
          <div>
            <div className="fm-hdr__name">Marutham <span>Agrolink</span></div>
            <div className="fm-hdr__tag">{t(user.seller_type === 'Retailer' ? 'farmer.tagRetailer' : 'farmer.tag')}</div>
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
          <IconButton onClick={logout} aria-label={t('farmer.logout')}>⎋</IconButton>
        </div>
      </header>

      <div className="fm-hero">
        <div className="fm-hero__icon" aria-hidden="true">🌾</div>
        <div>
          <h2>{t('farmer.welcome')}, {user.fname}!</h2>
          <p>{t('farmer.heroSub')}</p>
        </div>
      </div>

      <TabBar items={tabs} active={tab} onSelect={(id) => setTab(id as Tab)} />

      <div className="flex flex-1 flex-col gap-3 p-3.5">
        {tab === 'earnings' ? (
          <EarningsTab onRenew={() => setRenewing(true)} />
        ) : tab === 'products' ? (
          <ProductsTab />
        ) : (
          <EmptyState icon="📦">{t('farmer.comingSoon')}</EmptyState>
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
