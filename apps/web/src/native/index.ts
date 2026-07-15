/* Native-only bootstrap for the Capacitor Android/iOS shell. Everything here is a
 * no-op in the browser (Capacitor.isNativePlatform() is false), so main.tsx can
 * call initNative() unconditionally — the plugin code only runs on a device.
 *
 * Kept deliberately small: wire the app to the real backend, make the Android
 * hardware back button behave, and expose the online/offline signal. Push
 * registration lives in ./push so it can be called after the user signs in. */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { setApiBase } from '@marutham/api-client';

/** True inside the Android/iOS webview; false in any browser (incl. the PWA). */
export const isNative = (): boolean => Capacitor.isNativePlatform();

export async function initNative(): Promise<void> {
  if (!isNative()) return;

  // Same-origin '/api' reaches the webview, not the server. Point the api-client at
  // the absolute backend baked in at build time (VITE_API_BASE_URL).
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  if (apiBase) {
    setApiBase(apiBase);
  } else if (import.meta.env.DEV) {
    console.warn('[native] VITE_API_BASE_URL is unset — API calls will hit the webview origin.');
  }

  // Android hardware back button: step through history, and exit from the root
  // instead of leaving the user stranded on the first screen.
  await App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) {
      window.history.back();
    } else {
      void App.exitApp();
    }
  });
}

/** Subscribe to connectivity changes. Returns an unsubscribe fn. Fires immediately
 *  with the current status so callers don't need a separate initial read. */
export async function onNetworkChange(cb: (online: boolean) => void): Promise<() => void> {
  const status = await Network.getStatus();
  cb(status.connected);
  const handle = await Network.addListener('networkStatusChange', (s) => cb(s.connected));
  return () => void handle.remove();
}
