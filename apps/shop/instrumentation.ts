// Next.js instrumentation hook (stable in Next 15). Loads the right Sentry config for
// whichever runtime the server is booting, and forwards App Router server errors to
// Sentry. All of it is a no-op unless a DSN is configured (see the sentry.*.config
// files), so this is safe to ship unconditionally.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
