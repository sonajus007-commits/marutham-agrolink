import { useTranslation } from 'react-i18next';
import { EmptyState, Spinner } from '@marutham/ui';
import { pendingJobsFor, type Order, type OrderQueues } from '@marutham/lib';
import { QueueSection } from './QueueSection';
import { JobOffers } from './JobOffers';
import { ErrorState } from '../../components/ErrorState';

/* Delivery Tracking (Delivery Agent) / Collections (VCO) — the operational page.
 * The scan bar plus every live work queue, built from `queues` and the role.
 * The queue set differs by role: a VCO verifies and sends to hub; a Delivery
 * Agent collects, transits and delivers. Lifted verbatim from the old single
 * AgentPage body so behaviour is unchanged — only the surrounding chrome moved. */
export function AgentTracking({
  queues,
  loading,
  error,
  onRetry,
  isVCO,
  canDeliver = false,
  onOpenView,
  onOpenDeliver,
  onOpenVerify,
  onQuickScan,
  userId,
  onAssign,
  onJobsChanged,
}: {
  queues: OrderQueues | null;
  loading: boolean;
  error: string | null;
  /** Reload the queue now (the error state's Retry). */
  onRetry?: () => void;
  isVCO: boolean;
  /** A VCO who also works last-mile deliveries — shows the hub-collect lane too. */
  canDeliver?: boolean;
  onOpenView: (id: string) => void;
  onOpenDeliver: (id: string) => void;
  onOpenVerify: (id: string) => void;
  onQuickScan: (id: string) => Promise<void>;
  /** The signed-in user — whose pending job offers lead the page. */
  userId?: string;
  /** VCO: (re)pick the pickup agent of a verified parcel. */
  onAssign?: (order: Order) => void;
  /** An offer was accepted / declined — reload the queue. */
  onJobsChanged?: () => void;
}) {
  const { t } = useTranslation();

  // Jobs waiting for MY answer lead the page and are held out of the action lanes
  // below until accepted (the pickup scan would accept them too, but a parcel the
  // agent has not agreed to should not read as already theirs).
  const jobs = queues
    ? pendingJobsFor(
        [
          ...new Map(
            Object.values(queues)
              .flat()
              .map((o) => [o.id, o]),
          ).values(),
        ],
        userId,
      )
    : [];
  const offered = new Set(jobs.map((j) => j.order.id));
  const notOffered = (o: Order) => !offered.has(o.id);
  const pickUpDirect = queues
    ? queues.toPickUp.filter((o) => o.route !== 'hub' && notOffered(o))
    : [];
  const pickUpHub = queues ? queues.toPickUp.filter((o) => o.route === 'hub' && notOffered(o)) : [];
  const toCollect = queues ? queues.toCollect.filter(notOffered) : [];

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
              assignment: true,
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
              assignment: true,
            }
          : null,
        /* Hub lane: the Incharge has named this agent, and collecting it is their
           scan. A plain VCO never sees it — but a delivery-capable VCO assigned a
           last-mile drop does, so they can collect it from the hub. */
        (!isVCO || canDeliver) && toCollect.length
          ? {
              key: 'collect',
              title: `🏭 ${t('agent.queue.collect', 'Collect from Hub')}`,
              orders: toCollect,
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
      {loading ? (
        <Spinner label={t('agent.loadingOrders')} />
      ) : error && typeof navigator !== 'undefined' && !navigator.onLine ? (
        <EmptyState icon="📴">
          {t(
            'agent.offline.errorOffline',
            'You’re offline. This list will refresh automatically when the connection returns.',
          )}
        </EmptyState>
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : sections.length === 0 && jobs.length === 0 ? (
        <EmptyState icon="🎉">{t('agent.allClear')}</EmptyState>
      ) : (
        <>
          <JobOffers jobs={jobs} onChanged={() => onJobsChanged?.()} />
          {sections.map((s) => (
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
              showAssignment={'assignment' in s! && !!s!.assignment}
              onAssign={isVCO ? onAssign : undefined}
            />
          ))}
        </>
      )}
    </>
  );
}
