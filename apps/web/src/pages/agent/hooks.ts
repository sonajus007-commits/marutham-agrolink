import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type FieldDashboardResponse } from '@marutham/api-client';
import { groupOrders, deriveAgentStats, type OrderQueues, type AgentStats } from '@marutham/lib';

const REFRESH_MS = 60_000;

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
export function useAgentOrders(isVCO: boolean): AgentOrdersState {
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
      setStats(deriveAgentStats(q, isVCO));
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : t('agent.err.orders', 'Failed to load orders'));
    } finally {
      if (mounted.current) setLoading(false);
    }
    // `t` is a dependency: without it this closure keeps the language it was
    // created in, and the fallback would still be English after a switch.
  }, [isVCO, t]);

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
