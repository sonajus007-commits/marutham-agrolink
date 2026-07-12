import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// API path prefixes served by the Express backend. In dev these are proxied to
// the running backend (:3000) so the app hits the real API + DB with HMR.
//
// This used to list all sixteen routers by name, because the API answered at the
// root. It now lives under a single /api prefix — the root belongs to the public
// marketplace — so a new endpoint no longer needs a line here to work in dev.
const API_PREFIXES = ['/api', '/health'];

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';

export default defineConfig({
  // Built assets and routes live under /app so Express can serve the SPA there
  // alongside the legacy HTML site at the root.
  base: '/app/',
  plugins: [react(), tailwindcss()],
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
});
