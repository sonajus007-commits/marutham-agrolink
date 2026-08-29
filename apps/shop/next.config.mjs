import { withSentryConfig } from '@sentry/nextjs';
import withSerwistInit from '@serwist/next';

// Turns the marketplace into an installable, offline-capable PWA. Serwist compiles
// app/sw.ts into public/sw.js at build time and auto-registers it on the client.
// Disabled in dev so the worker never caches un-rebuilt pages during `next dev`.
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
  // The portal at /app registers its own worker; keep this one from ever claiming
  // that route or the /api front door as a client navigation the shell can answer.
  reloadOnOnline: true,
});

// Content-Security-Policy for the PUBLIC shop only. It lives here (not in the
// Express helmet) so it scopes to the marketplace and never touches the /app
// portal, whose in-app Google Map needs a looser policy. What each source is for:
//   script-src  self + inline (Next ships inline hydration scripts; nonces are a
//               later hardening step). Dev adds unsafe-eval for HMR.
//   style-src   self + inline (style={{…}} attributes) + Google Fonts stylesheet.
//   font-src    Google Fonts files.
//   img-src     self + data:/blob: + any https (farmer photo_url, product images).
//   connect-src self (the login fetch is same-origin). Dev adds ws: for HMR.
//   worker/manifest for the PWA; object/base/frame-ancestors locked down.
// NOTE: if a Sentry DSN is ever configured, add its ingest host to connect-src.
const isDev = process.env.NODE_ENV !== 'production';
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${isDev ? ' ws:' : ''}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, not a build — Next must compile them.
  transpilePackages: ['@marutham/lib', '@marutham/tokens'],
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  // Express is the single front door (see backend/server.js): the browser only
  // ever talks to :3000, which proxies the shop's routes here. That keeps the
  // shop and the /app portal on ONE ORIGIN, which is not a preference — the cart
  // (`ma_cart`) and the session (`ma_token`) live in origin-scoped localStorage,
  // so a visitor who signs in must land back holding what they picked.
  poweredByHeader: false,
  reactStrictMode: true,
};

// withSentryConfig adds the build-time plugin (source-map handling, tree-shaking of
// Sentry logger). With no org/project/auth token it does NOT upload anything and
// makes no network call, so the CI build (which has no DSN and no token) is safe.
export default withSerwist(
  withSentryConfig(nextConfig, {
    silent: !process.env.CI, // quiet locally; let CI surface any plugin output
    disableLogger: true, // drop Sentry's own debug logging from the client bundle
  }),
);
