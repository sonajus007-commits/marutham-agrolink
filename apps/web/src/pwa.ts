/* App-shell service worker (vite-plugin-pwa / workbox), registered by hand.
 *
 * The worker precaches the whole built bundle, so a browser that installed it
 * keeps serving THAT build until a new sw.js is fetched. On a developer machine
 * this is a trap: open a build once (e.g. Express serving apps/web/dist, or
 * `vite preview`) and the browser keeps showing that stale build long after you
 * switch back to the dev server — which answers /app/sw.js with HTML, so the
 * update check fails and the old worker never leaves.
 *
 * So the worker is installed only for real users on a real host. On a dev host
 * (localhost, LAN IPs, *.local/.test) any app-shell worker is removed instead,
 * along with its workbox caches. The dev server also serves a self-destructing
 * sw.js (vite.config.ts) for browsers whose stale worker never lets this code run.
 * The Firebase push worker (firebase-messaging-sw.js) is left alone. */

const BASE = import.meta.env.BASE_URL;
const APP_SW = `${BASE}sw.js`;

/** Hosts that are a developer's own machine or LAN — never a real deployment. */
export function isDevHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
  if (h.endsWith('.local') || h.endsWith('.test')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export async function setupServiceWorker(enabled: boolean): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (enabled && import.meta.env.PROD && !isDevHost(location.hostname)) {
      await navigator.serviceWorker.register(APP_SW, { scope: BASE });
      return;
    }
    // Dev host (or PWA off): clear out any app-shell worker a past build left.
    for (const reg of await navigator.serviceWorker.getRegistrations()) {
      const url = (reg.active ?? reg.waiting ?? reg.installing)?.scriptURL;
      if (url && new URL(url).pathname === APP_SW) await reg.unregister();
    }
    if (typeof caches !== 'undefined') {
      for (const key of await caches.keys()) {
        if (key.startsWith('workbox-')) await caches.delete(key);
      }
    }
  } catch (e) {
    // Never let worker housekeeping break app start-up.
    console.warn('[pwa] service worker setup skipped:', e);
  }
}
