import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type FieldDashboardResponse } from '@marutham/api-client';
import { groupOrders, deriveAgentStats, type OrderQueues, type AgentStats } from '@marutham/lib';
import { getCurrentPosition } from '../../native/geolocation';

const REFRESH_MS = 60_000;
/** How often an on-the-road agent's device reports its position for the live map. */
const LOCATION_PING_MS = 30_000;

/** Live IST clock string, ticking every second. */
export function useClock(): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ist = new Date(now + 5.5 * 3600000);
  let h = ist.getUTCHours();
  const m = ist.getUTCMinutes();
  const s = ist.getUTCSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)} ${ampm} IST`;
}

interface AgentOrdersState {
  queues: OrderQueues | null;
  stats: AgentStats | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Fetch orders, group into queues, derive stats, and poll every 60s. */
export function useAgentOrders(isVCO: boolean, canDeliver = false): AgentOrdersState {
  const { t } = useTranslation();
  const [queues, setQueues] = useState<OrderQueues | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getOrders();
      if (!mounted.current) return;
      const q = groupOrders(res.orders || []);
      setQueues(q);
      setStats(deriveAgentStats(q, isVCO, canDeliver));
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : t('agent.err.orders', 'Failed to load orders'));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // `t` is a dependency: without it this closure keeps the language it was
    // created in, and the fallback would still be English after a switch.
  }, [isVCO, canDeliver, t]);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  return { queues, stats, loading, error, reload: load };
}

/**
 * Beacon the agent's live position to the server while they're out delivering, so a
 * consumer tracking the order sees a moving dot on the map. Runs ONLY while `active`
 * (the agent has a parcel Picked Up or Out for Delivery); the moment their road work
 * is done the beacon stops, so we never publish a location for an off-duty agent.
 *
 * Silent and best-effort by design: it reuses PATCH /me (which stamps agent_loc_at),
 * skips a tick when location is declined or unavailable rather than nagging, and
 * never touches auth state — a background beacon must not re-render the app every
 * 30 s. It fires once on becoming active, then on the interval.
 */
export function useDeliveryLocationPing(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let inFlight = false;

    const ping = async () => {
      // The tab being in the background is not worth a GPS wake + write; the next
      // foreground tick catches up. Guards against overlap on a slow fix, too.
      if (inFlight || (typeof document !== 'undefined' && document.hidden)) return;
      inFlight = true;
      try {
        const pos = await getCurrentPosition();
        if (cancelled || !pos) return;
        await api.patchMe({ agent_lat: pos.lat, agent_lng: pos.lng });
      } catch {
        // Best-effort: a dropped beacon is a missing dot for one tick, never an error
        // the agent should see. The next tick tries again.
      } finally {
        inFlight = false;
      }
    };

    ping();
    const id = setInterval(ping, LOCATION_PING_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active]);
}

/** Field dashboard tiles, polled every 60s alongside orders. */
export function useFieldDashboard(): {
  data: FieldDashboardResponse | null;
  error: string | null;
  reload: () => void;
} {
  const { t } = useTranslation();
  const [data, setData] = useState<FieldDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await api.getFieldDashboard();
      if (mounted.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (mounted.current)
        setError(
          e instanceof Error ? e.message : t('agent.err.dashboard', 'Failed to load dashboard'),
        );
    }
  }, [t]);

  useEffect(() => {
    mounted.current = true;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  return { data, error, reload: load };
}
