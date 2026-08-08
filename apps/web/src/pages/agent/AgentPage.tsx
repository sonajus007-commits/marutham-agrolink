import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TabBar } from '@marutham/ui';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { api } from '@marutham/api-client';
import { statusKey } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAgentOrders, useFieldDashboard, useClock } from './hooks';
import { AgentOverview } from './AgentOverview';
import { AgentTracking } from './AgentTracking';
import { AgentDelivered } from './AgentDelivered';
import { ProfileContent } from './ProfileContent';
import { OrderViewSheet } from './sheets/OrderViewSheet';
import { DeliverSheet } from './sheets/DeliverSheet';
import { VerifySheet } from './sheets/VerifySheet';
import './agent.css';

type SheetKind = 'view' | 'deliver' | 'verify' | null;
interface SheetState {
  kind: SheetKind;
  orderId: string | null;
}

/* The four sections the field portal is split into — mirroring the Consumer and
 * Farmer portals: a left sidebar (desktop) / scrolling TabBar (phone) picks one,
 * and the right pane renders it. */
type Tab = 'overview' | 'work' | 'done' | 'profile';

export function AgentPage() {
  return (
    <ToastProvider>
      <AgentPageInner />
    </ToastProvider>
  );
}

function AgentPageInner() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const toast = useToast();
  const isVCO = user?.admin_role === 'VCO';
  // A VCO flagged can_deliver also works last-mile deliveries — their queues show
  // both the collection and the delivery lanes.
  const canDeliver = !!user?.can_deliver;

  const { queues, stats, loading, error, reload } = useAgentOrders(isVCO, canDeliver);
  const field = useFieldDashboard();
  const clock = useClock();

  const [tab, setTab] = useState<Tab>('overview');
  const [sheet, setSheet] = useState<SheetState>({ kind: null, orderId: null });
  const close = () => setSheet({ kind: null, orderId: null });
  const afterChange = () => {
    close();
    reload();
    field.reload();
  };
  const onScanned = () => {
    reload();
    field.reload();
  };

  if (!user) return null;

  const name = user.fname + (user.lname ? ' ' + user.lname : '');
  const sub = isVCO
    ? `VCO · ${(user.vco_city as string) || (user.village_town as string) || (user.district as string) || '—'}`
    : `${t('agent.role.deliveryAgent', 'Delivery Agent')} · ${(user.district as string) || '—'}`;

  async function quickScan(id: string) {
    try {
      const res = await api.scanOrder(id);
      /* Built from res.newStatus rather than echoing res.message: the server's
       * message is English prose it composed ("Order advanced to: Picked Up."),
       * and the status inside it is exactly what statusKey already speaks. */
      toast(
        t('agent.advanced', 'Advanced to: {{status}}', {
          status: t(statusKey(String(res.newStatus ?? '')), String(res.newStatus ?? '')),
        }),
        'ok',
      );
      reload();
      field.reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Scan failed', 'er');
    }
  }

  const setLang = (lang: AppLanguage) => changeLanguage(lang);

  // The operational tab's label/icon and the day's finished-tab label differ by
  // role: a VCO collects and completes; a Delivery Agent tracks and delivers.
  const workBadge = stats ? stats.queue : undefined;
  const navItems: { id: Tab; icon: string; label: string; badge?: number }[] = [
    { id: 'overview', icon: '🏠', label: t('agent.nav.overview', 'Overview') },
    {
      id: 'work',
      icon: isVCO ? '📋' : '🚚',
      label: isVCO
        ? canDeliver
          ? t('agent.nav.collectionsDelivery', 'Collections & Delivery')
          : t('agent.nav.collections', 'Collections')
        : t('agent.nav.tracking', 'Delivery Tracking'),
      badge: workBadge || undefined,
    },
    {
      id: 'done',
      icon: '✅',
      label: isVCO ? t('agent.nav.completed', 'Completed') : t('agent.nav.delivered', 'Delivered'),
    },
    { id: 'profile', icon: '⚙️', label: t('agent.nav.profile', 'Profile') },
  ];

  return (
    <div className="agent-shell">
      <header className="agent-hdr">
        <a href="/app/agent" className="agent-hdr__brand">
          <div className="hring" style={{ width: 42, height: 32 }}>
            <img
              src="/img/logo-sm.jpg"
              alt="MA"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
          <div>
            <div className="agent-hdr__name">
              Marutham <span>Agrolink</span>
            </div>
            <div className="agent-hdr__tag">{isVCO ? 'VCO' : t('agent.tag')}</div>
          </div>
        </a>
        <div className="agent-hdr__right">
          <div className="agent-pill">
            <div className="agent-dot" />
            <span className="agent-pill__text">{t('agent.onDuty')}</span>
          </div>
          <div className="agent-lang">
            <button className={i18n.language === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
              EN
            </button>
            <button
              className={`tamil ${i18n.language === 'ta' ? 'on' : ''}`}
              onClick={() => setLang('ta')}
            >
              த
            </button>
          </div>
          <button
            className={`agent-iconbtn${tab === 'profile' ? ' is-active' : ''}`}
            onClick={() => setTab(tab === 'profile' ? 'overview' : 'profile')}
            aria-pressed={tab === 'profile'}
            aria-label={t('agent.profile')}
          >
            👤
          </button>
          <button className="agent-iconbtn" onClick={logout} aria-label={t('agent.exit')}>
            ⎋
          </button>
        </div>
      </header>

      <div className="agent-body">
        {/* Sidebar — a >=1024px enhancement; the TabBar drives phones. */}
        <nav className="agent-side" aria-label={t('agent.nav.label', 'Field sections')}>
          <ul className="agent-side__list">
            {navItems.map((it) => {
              const on = tab === it.id;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    className={`agent-side__item${on ? ' is-active' : ''}`}
                    aria-current={on ? 'page' : undefined}
                    onClick={() => setTab(it.id)}
                  >
                    <span className="agent-side__icon" aria-hidden="true">
                      {it.icon}
                    </span>
                    <span className="agent-side__label">{it.label}</span>
                    {it.badge ? <span className="agent-side__badge">{it.badge}</span> : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="agent-side__item agent-side__logout" onClick={logout}>
            <span className="agent-side__icon" aria-hidden="true">
              ⎋
            </span>
            <span className="agent-side__label">{t('agent.profile.signOut')}</span>
          </button>
        </nav>

        <div className="agent-main">
          <TabBar
            className="agent-tabbar"
            items={navItems.map((it) => ({
              id: it.id,
              label: `${it.icon} ${it.label}`,
              badge: it.badge,
            }))}
            active={tab}
            onSelect={(id) => setTab(id as Tab)}
            aria-label={t('agent.nav.label', 'Field sections')}
          />

          <div className="agent-pane">
            {tab === 'overview' ? (
              <AgentOverview
                name={name}
                sub={sub}
                clock={clock}
                stats={stats}
                isVCO={isVCO}
                field={field}
              />
            ) : tab === 'work' ? (
              <AgentTracking
                queues={queues}
                loading={loading}
                error={error}
                isVCO={isVCO}
                canDeliver={canDeliver}
                onScanned={onScanned}
                onOpenView={(id) => setSheet({ kind: 'view', orderId: id })}
                onOpenDeliver={(id) => setSheet({ kind: 'deliver', orderId: id })}
                onOpenVerify={(id) => setSheet({ kind: 'verify', orderId: id })}
                onQuickScan={quickScan}
              />
            ) : tab === 'done' ? (
              <AgentDelivered
                orders={queues ? queues.delivered : []}
                onOpenView={(id) => setSheet({ kind: 'view', orderId: id })}
              />
            ) : (
              <ProfileContent isVCO={isVCO} />
            )}
          </div>
        </div>
      </div>

      {/* Order-action sheets */}
      <OrderViewSheet open={sheet.kind === 'view'} orderId={sheet.orderId} onClose={close} />
      <DeliverSheet
        open={sheet.kind === 'deliver'}
        orderId={sheet.orderId}
        onClose={close}
        onChanged={afterChange}
      />
      <VerifySheet
        open={sheet.kind === 'verify'}
        orderId={sheet.orderId}
        onClose={close}
        onChanged={afterChange}
      />
    </div>
  );
}
