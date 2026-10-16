import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@marutham/api-client';

/**
 * Single shared QueryClient for the console.
 *
 * Defaults are tuned for an internal dashboard app talking to our own API:
 *   • staleTime 30s — dashboards don't need per-focus refetches; this stops a
 *     tab-switch from re-hammering the API for data that just loaded.
 *   • retry once, and only what a retry can fix: a network drop, a 5xx, a 429.
 *     A 4xx (403, 404, an expired 401) or a timeout (408 — the user already
 *     waited the full limit) is answered at once so the screen can say why.
 *   • refetchOnWindowFocus off — same reason as staleTime; opt back in per-query
 *     for anything genuinely live (e.g. the agent queue) rather than globally.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (count, err) =>
        count < 1 &&
        !(err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429),
      refetchOnWindowFocus: false,
    },
  },
});
