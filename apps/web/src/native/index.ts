/* Native-only bootstrap for the Capacitor Android/iOS shell. Everything here is a
 * no-op in the browser (Capacitor.isNativePlatform() is false), so main.tsx can
 * call initNative() unconditionally — the plugin code only runs on a device.
 *
 * Kept deliberately small: wire the app to the real backend, theme the status bar,
 * dismiss the splash once the UI is up, make the Android hardware back button
 * behave, and expose the online/offline signal. Push registration lives in ./push
 * so it can be called after the user signs in. */
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Network } from '@capacitor/network';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { setApiBase } from '@marutham/api-client';
import { colors } from '@marutham/tokens';

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

  // Brand the status bar (green chrome, light icons) to match the launch screen and
  // the PWA theme_color. setBackgroundColor is Android-only; it throws on iOS, so it
  // is guarded. Wrapped in try/catch — status-bar styling must never abort startup.
  try {
    await StatusBar.setStyle({ style: Style.Dark }); // 'Dark' = light content on a dark bar
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: colors.forest });
    }
  } catch (err) {
    console.error('[native] status bar styling failed', err);
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

  // The UI has mounted by now (main.tsx renders before this resolves), so drop the
  // splash. launchAutoHide is off in capacitor.config.ts, so nothing else will.
  await SplashScreen.hide();
}

/** Subscribe to connectivity changes. Returns an unsubscribe fn. Fires immediately
 *  with the current status so callers don't need a separate initial read. */
export async function onNetworkChange(cb: (online: boolean) => void): Promise<() => void> {
  const status = await Network.getStatus();
  cb(status.connected);
  const handle = await Network.addListener('networkStatusChange', (s) => cb(s.connected));
  return () => void handle.remove();
}
