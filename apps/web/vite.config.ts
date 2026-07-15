/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// API path prefixes served by the Express backend. In dev these are proxied to
// the running backend (:3000) so the app hits the real API + DB with HMR.
//
// This used to list all sixteen routers by name, because the API answered at the
// root. It now lives under a single /api prefix — the root belongs to the public
// marketplace — so a new endpoint no longer needs a line here to work in dev.
const API_PREFIXES = ['/api', '/health'];

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';

// Capacitor loads the built bundle from the native webview's root, not from the
// Express '/app' mount — so a mobile build (`CAPACITOR=1 pnpm build`) is served at
// '/'. The router basename and admin APP_BASE both derive from this same base
// (import.meta.env.BASE_URL), so one flag flips the whole app between the two.
const isCapacitor = process.env.CAPACITOR === '1';

export default defineConfig({
  // Built assets and routes live under /app so Express can serve the SPA there
  // alongside the legacy HTML site at the root — except in a native build (see above).
  base: isCapacitor ? '/' : '/app/',
  plugins: [
    react(),
    tailwindcss(),
    // Progressive Web App: makes the /app portal installable and offline-capable.
    // The service worker's scope follows the base ('/app/'), so it only ever controls
    // the SPA — never the legacy site at '/' or the '/api' backend. autoUpdate ships a
    // new worker as soon as a deploy lands. Disabled in dev (devOptions.enabled:false).
    // Skipped for native builds: Capacitor already serves the bundle from a local
    // webview, so a second service worker would only fight it for cache control.
    !isCapacitor &&
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icons/*.png'],
        manifest: {
          name: 'Marutham AgroLink',
          short_name: 'AgroLink',
          description:
            'Marutham AgroLink — the farm-to-consumer portal for sellers, buyers and field staff.',
          id: '/app/',
          start_url: '/app/',
          scope: '/app/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#2E7D32',
          background_color: '#ffffff',
          icons: [
            { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            {
              src: 'icons/maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          // firebase-messaging-sw.js is itself a service worker (Firebase web push);
          // the app-shell worker must not precache it or claim its scope.
          globIgnores: ['**/firebase-messaging-sw.js'],
          // The ECharts chunk is ~1 MB; lift the precache ceiling so it is cached too.
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          cleanupOutdatedCaches: true,
        },
        devOptions: { enabled: false },
      }),
  ],
  resolve: {
    // Ensure a single React instance across the app and the aliased UI package.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@marutham/tokens': path.resolve(__dirname, '../../packages/tokens/src'),
      '@marutham/lib': path.resolve(__dirname, '../../packages/lib/src'),
      '@marutham/api-client': path.resolve(__dirname, '../../packages/api-client/src'),
      '@marutham/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@marutham/i18n': path.resolve(__dirname, '../../packages/i18n/src'),
    },
  },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: BACKEND, changeOrigin: true }]),
    ),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  // Component tests run through Vite, so the `resolve.alias` above (the workspace
  // packages) applies here too — no second alias list to keep in sync. Tailwind
  // is skipped (`css: false`): these tests assert behaviour and the DOM, not
  // computed styles, and processing the stylesheet only slows the run down.
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
