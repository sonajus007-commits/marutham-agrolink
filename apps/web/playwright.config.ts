import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for the console SPA.
//
// STRATEGY. CI has no database and the backend is the single front door, so these
// tests drive the REAL production bundle served by `vite preview` and mock the `/api`
// responses per test with Playwright's request interception. That exercises the
// actual build, the router, rendering and interaction — without needing a booted
// backend or Supabase. The app is served under /app/ (the Express mount), so that is
// the baseURL; specs navigate with relative paths.
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/app/`,
    trace: 'on-first-retry',
    // The app ships a PWA service worker; block it in tests so precaching can't serve
    // a stale page and make assertions non-deterministic. We test app logic, not the SW.
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Build the app, then serve the built bundle. `vite preview` needs a prior build,
  // so the command does both; locally an already-running server is reused.
  webServer: {
    // corepack, not a bare `pnpm` — pnpm is not on PATH in this repo (it is invoked
    // as `corepack pnpm` everywhere, including CI). `vite preview` needs a prior
    // build, so the command does both; locally an already-running server is reused.
    command: `corepack pnpm exec vite build && corepack pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/app/`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
