/// <reference lib="webworker" />
// The service worker source for the public marketplace. Serwist compiles this
// file separately from `next build` (its own webpack pass, with the WebWorker
// lib), then emits `public/sw.js` with the precache manifest injected in place
// of `self.__SW_MANIFEST`. It is excluded from the app tsconfig so `tsc` never
// tries to typecheck it against the DOM lib — see apps/shop/tsconfig.json.
import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Serwist replaces this with the list of build assets to precache.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
  // The shop is served at the origin root ('/'), which also fronts the Express
  // API ('/api/*') and the Vite portal ('/app/*', which registers its OWN worker
  // with the narrower '/app/' scope and therefore wins there). Keep this worker
  // off both: never hand an app-shell fallback to an API call or a portal route.
  fallbacks: undefined,
});

serwist.addEventListeners();
