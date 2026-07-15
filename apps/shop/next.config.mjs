import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, not a build — Next must compile them.
  transpilePackages: ['@marutham/lib', '@marutham/tokens'],
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
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI, // quiet locally; let CI surface any plugin output
  disableLogger: true, // drop Sentry's own debug logging from the client bundle
});
