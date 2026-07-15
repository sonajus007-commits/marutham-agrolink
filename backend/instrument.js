// Sentry initialisation for the API.
//
// This file MUST be required at the very top of server.js — before express and the
// route modules load — because Sentry's auto-instrumentation patches http/express
// as they are required, and cannot patch what is already in memory.
//
// It is a NO-OP unless SENTRY_DSN is set: dev boxes, the test suite, and CI never
// set it, so Sentry costs nothing and reaches no network there. A deployment opts in
// purely by setting the env var — no code change.
require('dotenv').config();
const Sentry = require('@sentry/node');

const enabled = Boolean(process.env.SENTRY_DSN);

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    // Errors are always captured; this samples performance transactions. Keep it low
    // in production and raise per-deployment via the env var if you need more traces.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    // This API handles PII (phone numbers, bank references, order addresses). Do NOT
    // let Sentry attach request bodies / local variables by default; opt in knowingly.
    sendDefaultPii: false,
  });
}

module.exports = { Sentry, enabled };
