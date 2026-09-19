import { useState, type ComponentType, type SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HomeIcon,
  ClipboardIcon,
  TruckIcon,
  CheckCircleIcon,
  SettingsIcon,
  UserIcon,
  LogOutIcon,
} from '../../components/icons';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { ScanFab } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { statusKey } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAgentOrders, useFieldDashboard, useClock, useDeliveryLocationPing } from './hooks';
import { AgentOverview } from './AgentOverview';
import { AgentTracking } from './AgentTracking';
import { AgentDelivered } from './AgentDelivered';
import { ProfileContent } from './ProfileContent';
import { OrderViewSheet } from './sheets/OrderViewSheet';
import { DeliverSheet } from './sheets/DeliverSheet';
import { VerifySheet } from './sheets/VerifySheet';
import { ScanSheet } from './ScanSheet';
import { LogVisitSheet } from './sheets/LogVisitSheet';
import { NotificationBell } from '../../components/NotificationBell';
import { OfflineBar } from '../../components/OfflineBar';
import { DutyToggle } from './DutyToggle';
import './agent.css';

/* A QR/scan glyph for the ScanFab — corner brackets + a scan line. Inherits size
 * from the FAB (which sets svg to 1.5rem) and colour via currentColor. */
function ScanGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path
        d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"
        strokeLinecap="round"
      />
      <line x1="4" y1="12" x2="20" y2="12" strokeLinecap="round" />
    </svg>
  );
}

type SheetKind = 'view' | 'deliver' | 'verify' | null;
interface SheetState {
  kind: SheetKind;
  orderId: string | null;
}

/* The four sections the field portal is split into — mirroring the Consumer and
 * Farmer portals: a left sidebar (desktop) / fixed bottom nav (phone) picks one,
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

  // Beacon this agent's live position while they're on the road (a parcel Picked Up
  // or Out for Delivery), so consumers tracking those orders see a moving dot. A VCO
  // who doesn't do deliveries never beacons. Stops the moment the road work clears.
  const onTheRoad =
    (user?.admin_role === 'Delivery Agent' || canDeliver) &&
    !!queues &&
    queues.inTransit.length + queues.toDeliver.length > 0;
  useDeliveryLocationPing(onTheRoad);

  const [tab, setTab] = useState<Tab>('overview');
  const [scanOpen, setScanOpen] = useState(false);
  const [visitOpen, setVisitOpen] = useState(false);
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
  const navItems: {
    id: Tab;
    Icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;
    label: string;
    short: string;
    badge?: number;
  }[] = [
    {
      id: 'overview',
      Icon: HomeIcon,
      label: t('agent.nav.overview', 'Overview'),
      short: t('agent.navShort.overview', 'Home'),
    },
    {
      id: 'work',
      Icon: isVCO ? ClipboardIcon : TruckIcon,
      label: isVCO
        ? canDeliver
          ? t('agent.nav.collectionsDelivery', 'Collections & Delivery')
          : t('agent.nav.collections', 'Collections')
        : t('agent.nav.tracking', 'Delivery Tracking'),
      short: isVCO
        ? t('agent.navShort.collections', 'Collect')
        : t('agent.navShort.tracking', 'Deliver'),
      badge: workBadge || undefined,
    },
    {
      id: 'done',
      Icon: CheckCircleIcon,
      label: isVCO ? t('agent.nav.completed', 'Completed') : t('agent.nav.delivered', 'Delivered'),
      short: t('agent.navShort.done', 'Done'),
    },
    {
      id: 'profile',
      Icon: SettingsIcon,
      label: t('agent.nav.profile', 'Profile'),
      short: t('agent.navShort.profile', 'Profile'),
    },
  ];

  return (
    <div className="agent-shell">
      <header className="agent-hdr">
        <a href="/app/agent" className="agent-hdr__brand">
          <div className="hring agent-hdr__logo">
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
          <NotificationBell />
          <DutyToggle />
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
          {/* Profile stays in the bottom-nav Profile tab on phones; logout rides the
              header everywhere. The wordmark shrinks + stays on one line to fit the
              busy bar (bell + duty + language + logout). */}
          <button
            className={`agent-iconbtn agent-hdr__deskonly${tab === 'profile' ? ' is-active' : ''}`}
            onClick={() => setTab(tab === 'profile' ? 'overview' : 'profile')}
            aria-pressed={tab === 'profile'}
            aria-label={t('agent.profile')}
          >
            <UserIcon size={18} />
          </button>
          <button className="agent-iconbtn" onClick={logout} aria-label={t('agent.exit')}>
            <LogOutIcon size={18} />
          </button>
        </div>
      </header>

      <div className="agent-body">
        {/* Sidebar — a >=1024px enhancement; the bottom nav drives phones. */}
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
                      <it.Icon size={18} />
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
              <LogOutIcon size={18} />
            </span>
            <span className="agent-side__label">{t('agent.profile.signOut')}</span>
          </button>
        </nav>

        <div className="agent-main">
          {/* Connectivity truth for field work — offline notice + pending-sync count.
              Renders nothing when online with a drained queue. */}
          <OfflineBar />
          <div className="agent-pane">
            {tab === 'overview' ? (
              <AgentOverview
                name={name}
                sub={sub}
                clock={clock}
                stats={stats}
                isVCO={isVCO}
                field={field}
                onNavigate={setTab}
                onLogVisit={isVCO ? () => setVisitOpen(true) : undefined}
              />
            ) : tab === 'work' ? (
              <AgentTracking
                queues={queues}
                loading={loading}
                error={error}
                isVCO={isVCO}
                canDeliver={canDeliver}
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

      {/* Fixed bottom navigation (phone) — the same native-app pattern as the
          consumer & farmer apps. Hidden at >=1024px where the sidebar takes over. */}
      <nav className="agent-bottomnav" aria-label={t('agent.nav.label', 'Field sections')}>
        {navItems.map((it) => {
          const on = tab === it.id;
          return (
            <button
              key={it.id}
              type="button"
              className={`agent-bnav__item${on ? ' is-active' : ''}`}
              aria-current={on ? 'page' : undefined}
              onClick={() => setTab(it.id)}
            >
              <span className="agent-bnav__icon" aria-hidden="true">
                <it.Icon size={22} />
                {it.badge ? <span className="agent-bnav__badge">{it.badge}</span> : null}
              </span>
              <span className="agent-bnav__label">{it.short}</span>
            </button>
          );
        })}
      </nav>

      {/* Scan-first: a thumb-reachable primary action on every field tab (except the
          profile tab). Opens the scan sheet — the fastest path to advance any order. */}
      {tab !== 'profile' ? (
        <ScanFab
          extended
          icon={<ScanGlyph />}
          label={t('agent.scan.fab', 'Scan')}
          onClick={() => setScanOpen(true)}
          className="agent-scanfab"
        />
      ) : null}
      <ScanSheet open={scanOpen} onClose={() => setScanOpen(false)} onScanned={onScanned} />
      <LogVisitSheet open={visitOpen} onClose={() => setVisitOpen(false)} onLogged={field.reload} />

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
