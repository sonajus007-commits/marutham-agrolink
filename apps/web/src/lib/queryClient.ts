import { QueryClient } from '@tanstack/react-query';

/**
 * Single shared QueryClient for the console.
 *
 * Defaults are tuned for an internal dashboard app talking to our own API:
 *   • staleTime 30s — dashboards don't need per-focus refetches; this stops a
 *     tab-switch from re-hammering the API for data that just loaded.
 *   • retry 1 — our API returns real 4xx/5xx; retrying a 403 five times is noise.
 *   • refetchOnWindowFocus off — same reason as staleTime; opt back in per-query
 *     for anything genuinely live (e.g. the agent queue) rather than globally.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
