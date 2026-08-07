import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@marutham/ui';
import type { OrderQueues } from '@marutham/lib';
import { ScanBar } from './ScanBar';
import { QueueSection } from './QueueSection';

/* Delivery Tracking (Delivery Agent) / Collections (VCO) — the operational page.
 * The scan bar plus every live work queue, built from `queues` and the role.
 * The queue set differs by role: a VCO verifies and sends to hub; a Delivery
 * Agent collects, transits and delivers. Lifted verbatim from the old single
 * AgentPage body so behaviour is unchanged — only the surrounding chrome moved. */
export function AgentTracking({
  queues,
  loading,
  error,
  isVCO,
  onScanned,
  onOpenView,
  onOpenDeliver,
  onOpenVerify,
  onQuickScan,
}: {
  queues: OrderQueues | null;
  loading: boolean;
  error: string | null;
  isVCO: boolean;
  onScanned: () => void;
  onOpenView: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onOpenVerify: (id: string) => void;
  onQuickScan: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();

  const pickUpDirect = queues ? queues.toPickUp.filter((o) => o.route !== 'hub') : [];
  const pickUpHub = queues ? queues.toPickUp.filter((o) => o.route === 'hub') : [];

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
        /* A verified order is split by ROUTE: a direct one is collected for the
           doorstep, a hub one is run to the hub. Same scan, different journey — one
           "Pick Up" button for both read as a mistake once the hub order came back
           saying "In Transit". */
        pickUpDirect.length
          ? {
              key: 'pickup',
              title: `📦 ${t('agent.queue.pickup')}`,
              orders: pickUpDirect,
              action: 'pickup' as const,
              cls: 'q-section--pickup',
              btn: `⬆ ${t('agent.btn.pickup')}`,
            }
          : null,
        pickUpHub.length
          ? {
              key: 'tohub',
              title: `🏭 ${t('agent.queue.toHub', 'Send to Hub')}`,
              orders: pickUpHub,
              action: 'pickup' as const,
              cls: 'q-section--transit',
              btn: `🚚 ${t('agent.btn.toHub', 'Send to Hub')}`,
            }
          : null,
        /* Hub lane: the Incharge has named this agent, and collecting it is their
           scan. A VCO never sees it — a VCO does not work the hub. */
        !isVCO && queues.toCollect.length
          ? {
              key: 'collect',
              title: `🏭 ${t('agent.queue.collect', 'Collect from Hub')}`,
              orders: queues.toCollect,
              action: 'pickup' as const,
              cls: 'q-section--pickup',
              btn: `⬆ ${t('agent.btn.collect', 'Collect')}`,
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
    <>
      <ScanBar onScanned={onScanned} />

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
            onOpenView={onOpenView}
            onOpenDeliver={onOpenDeliver}
            onOpenVerify={onOpenVerify}
            onQuickScan={onQuickScan}
          />
        ))
      )}
    </>
  );
}
