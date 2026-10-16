import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { subscribeOffline, subscribeSlowNetwork } from '@marutham/api-client';
import { onNetworkChange } from '../native';

/* A slim, always-honest connectivity bar, mounted in every portal shell.
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
 *   • subscribeSlowNetwork — true while any API request has run past SLOW_AFTER_MS,
 *     so a weak signal reads as "slow connection", not a frozen screen.
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

  const [slow, setSlow] = useState(false);

  useEffect(() => subscribeOffline(setPending), []);
  useEffect(() => subscribeSlowNetwork(setSlow), []);

  // Online, queue drained, but a request is dragging — say so.
  if (online && pending === 0 && slow) {
    return (
      <div className="offline-bar is-slow" role="status" aria-live="polite">
        <span className="offline-bar__dot" aria-hidden="true" />
        <span className="offline-bar__msg">
          {t('state.slow', 'Slow connection — this is taking longer than usual…')}
        </span>
      </div>
    );
  }

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
