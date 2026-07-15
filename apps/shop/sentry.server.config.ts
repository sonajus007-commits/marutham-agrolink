// Sentry for the shop's server runtime (Node). No-op unless SENTRY_DSN is set, so
// dev and the CI `build:shop` (which runs with no DSN) are unaffected.
import * as Sentry from '@sentry/nextjs';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
  });
}
