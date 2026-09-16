import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeOffline } from '@marutham/api-client';
import { onNetworkChange } from '../native';

/* A slim, always-honest connectivity bar for the field portals.
 *
 * Field roles (VCO, Delivery) work where signal dies, so the offline write queue
 * (commit 70fede8) is load-bearing here. This surfaces its two states the plan's
 * Section L asks for — "You're offline" and a global pending-sync count — instead
 * of the bare "Network error" the design brief calls out. It renders nothing when
 * online with an empty queue, so it costs no space in the common case.
 *
 * State comes from two live sources, no polling:
 *   • onNetworkChange — Capacitor Network on device, navigator.onLine in the browser.
 *   • subscribeOffline — the queue's own pending-write count (fires on enqueue/flush).
 */
export function OfflineBar() {
  const { t } = useTranslation();
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    // onNetworkChange resolves to an unsubscribe; guard against unmount before it does.
    let unsub: (() => void) | undefined;
    let cancelled = false;
    onNetworkChange((v) => setOnline(v)).then((fn) => {
      if (cancelled) fn();
      else unsub = fn;
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  useEffect(() => subscribeOffline(setPending), []);

  // Nothing to say when the device is online and the queue has drained.
  if (online && pending === 0) return null;

  const offline = !online;
  const message = offline
    ? pending > 0
      ? `${t('agent.offline.offline', 'You’re offline.')} ${t('agent.offline.willSync', {
          count: pending,
          defaultValue_one: '{{count}} update will sync automatically when you’re back online.',
          defaultValue_other: '{{count}} updates will sync automatically when you’re back online.',
        })}`
      : t(
          'agent.offline.offlineNoQueue',
          'You’re offline. Your work is saved and will sync when you reconnect.',
        )
    : // online with a non-empty queue → the flush is in flight.
      t('agent.offline.syncing', {
        count: pending,
        defaultValue_one: 'Back online — syncing {{count}} update…',
        defaultValue_other: 'Back online — syncing {{count}} updates…',
      });

  return (
    <div
      className={`offline-bar${offline ? ' is-offline' : ' is-syncing'}`}
      role="status"
      aria-live="polite"
    >
      <span className="offline-bar__dot" aria-hidden="true" />
      <span className="offline-bar__msg">{message}</span>
    </div>
  );
}
