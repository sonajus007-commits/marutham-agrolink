import type { CapacitorConfig } from '@capacitor/cli';

/* Capacitor wraps the built Vite SPA (dist/) as a native Android/iOS app.
 *
 * Build the web assets for native first — `CAPACITOR=1 pnpm --filter @marutham/web build`
 * — so Vite emits with base '/' (the webview serves from the bundle root, not the
 * Express '/app' mount). Then `pnpm --filter @marutham/web cap:sync` copies dist/
 * into the native project. See package.json scripts.
 *
 * The native shell talks to the real backend over the network, not same-origin, so
 * set VITE_API_BASE_URL at build time (e.g. https://api.marutham.example/api) and
 * src/native/index.ts feeds it to the api-client. localhost will not reach a device. */
const config: CapacitorConfig = {
  appId: 'com.marutham.agrolink',
  appName: 'Marutham AgroLink',
  webDir: 'dist',
  plugins: {
    // FCM-backed push. Android also needs android/app/google-services.json from your
    // Firebase project; iOS needs an APNs key wired to Firebase. See src/native/push.ts.
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
