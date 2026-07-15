import type { ReactNode } from 'react';
import * as Sentry from '@sentry/react';

// Browser error + performance monitoring for the console app.
//
// NO-OP unless VITE_SENTRY_DSN is defined at build time. Dev and CI leave it unset,
// so init never runs and no network call is made; a deployment opts in by defining
// the env var. (The SDK still ships in the bundle either way — that's the price of
// being able to catch the very first error after a deploy.)
const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

export function initSentry() {
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    // Errors are always captured; this samples performance traces.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}

/** Last-resort UI when a render throws — a blank white screen tells the user nothing. */
function Fallback() {
  return (
    <div
      role="alert"
      className="bg-bg text-fg"
      style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '2rem' }}
    >
      <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-fg-muted" style={{ marginTop: '0.5rem' }}>
          The page hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-primary text-primary-on font-bold rounded-sm"
          style={{ marginTop: '1.25rem', padding: '0.6rem 1.25rem', border: 0, cursor: 'pointer' }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

/**
 * Wraps the app so a thrown render error is reported to Sentry (when enabled) and the
 * user sees the Fallback instead of a white screen. Works as a plain React error
 * boundary even when Sentry is disabled, so the crash-screen improvement stands alone.
 */
export function AppErrorBoundary({ children }: { children: ReactNode }) {
  return <Sentry.ErrorBoundary fallback={<Fallback />}>{children}</Sentry.ErrorBoundary>;
}
