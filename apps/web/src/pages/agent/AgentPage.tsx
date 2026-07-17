import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@marutham/ui';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { api } from '@marutham/api-client';
import { statusKey } from '@marutham/lib';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider, useToast } from '../../components/Toast';
import { useAgentOrders, useFieldDashboard, useClock } from './hooks';
import { StatsRow } from './StatsRow';
import { FieldDashboard } from './FieldDashboard';
import { ScanBar } from './ScanBar';
import { QueueSection } from './QueueSection';
import { DeliveredList } from './DeliveredList';
import { OrderViewSheet } from './sheets/OrderViewSheet';
import { DeliverSheet } from './sheets/DeliverSheet';
import { VerifySheet } from './sheets/VerifySheet';
import { ProfileSheet } from './sheets/ProfileSheet';
import './agent.css';

type SheetKind = 'view' | 'deliver' | 'verify' | 'profile' | null;
interface SheetState {
  kind: SheetKind;
  orderId: string | null;
}

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

  const { queues, stats, loading, error, reload } = useAgentOrders(isVCO);
  const field = useFieldDashboard();
  const clock = useClock();

  const [sheet, setSheet] = useState<SheetState>({ kind: null, orderId: null });
  const close = () => setSheet({ kind: null, orderId: null });
  const afterChange = () => {
    close();
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

  const sections = queues
    ? [
        isVCO && queues.toVerify.length
          ? {
              key: 'verify',
              title: `📋 ${t('agent.queue.verify')}`,
              orders: queues.toVerify,
              action: 'verify' as const,
              cls: 'q-section--verify',
              btn: `✓ ${t('agent.btn.verify')}`,
            }
          : null,
        queues.toPickUp.length
          ? {
              key: 'pickup',
              title: `📦 ${t('agent.queue.pickup')}`,
              orders: queues.toPickUp,
              action: 'pickup' as const,
              cls: 'q-section--pickup',
              btn: `⬆ ${t('agent.btn.pickup')}`,
            }
          : null,
        queues.inTransit.length
          ? {
              key: 'transit',
              title: `🚚 ${t('agent.queue.transit')}`,
              orders: queues.inTransit,
              action: 'transit' as const,
              cls: 'q-section--transit',
              btn: `→ ${t('agent.btn.outForDelivery')}`,
            }
          : null,
        queues.toDeliver.length
          ? {
              key: 'deliver',
              title: `🛵 ${t('agent.queue.deliver')}`,
              orders: queues.toDeliver,
              action: 'deliver' as const,
              cls: 'q-section--deliver',
              btn: `${t('agent.btn.deliver')} →`,
            }
          : null,
        queues.inProgress.length
          ? {
              key: 'inprogress',
              title: `🚚 ${t('agent.queue.inProgress')}`,
              orders: queues.inProgress,
              action: 'view' as const,
              cls: 'q-section--transit',
              btn: '',
            }
          : null,
      ].filter(Boolean)
    : [];

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
            className="agent-iconbtn"
            onClick={() => setSheet({ kind: 'profile', orderId: null })}
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
        <div className="agent-id">
          <div>
            <div className="agent-id__name">{name}</div>
            <div className="agent-id__sub">{sub}</div>
          </div>
          <div>
            <div className="agent-clock">{clock}</div>
          </div>
        </div>

        <StatsRow stats={stats} isVCO={isVCO} />

        <FieldDashboard data={field.data} onRefresh={field.reload} />

        <ScanBar
          onScanned={() => {
            reload();
            field.reload();
          }}
        />

        {loading ? (
          <Spinner label={t('agent.loadingOrders')} />
        ) : error ? (
          <EmptyState>{error}</EmptyState>
        ) : sections.length === 0 ? (
          <EmptyState icon="🎉">{t('agent.allClear')}</EmptyState>
        ) : (
          sections.map((s) => (
            <QueueSection
              key={s!.key}
              title={s!.title}
              orders={s!.orders}
              action={s!.action}
              sectionClass={s!.cls}
              btnLabel={s!.btn}
              onOpenView={(id) => setSheet({ kind: 'view', orderId: id })}
              onOpenDeliver={(id) => setSheet({ kind: 'deliver', orderId: id })}
              onOpenVerify={(id) => setSheet({ kind: 'verify', orderId: id })}
              onQuickScan={quickScan}
            />
          ))
        )}

        {queues ? (
          <DeliveredList
            orders={queues.delivered}
            onOpenView={(id) => setSheet({ kind: 'view', orderId: id })}
          />
        ) : null}
      </div>

      {/* Sheets */}
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
      <ProfileSheet open={sheet.kind === 'profile'} onClose={close} isVCO={isVCO} />
    </div>
  );
}
