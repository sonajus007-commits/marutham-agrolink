/* Web (browser / installed-PWA) push via Firebase Cloud Messaging.
 *
 * The NATIVE app pushes through @capacitor/push-notifications (../native/push.ts);
 * this is the arm for the portal running as a plain website or a PWA. Both funnel
 * the token to the same backend (POST /api/notifications/device, platform 'web').
 *
 * NO-OP unless the VITE_FIREBASE_* config is set at build time — the exact stance
 * Sentry takes here (src/sentry.tsx). Dev, CI, and any build without the config
 * initialize nothing and never prompt for notification permission. To switch it on,
 * supply a Firebase *test* project's PUBLIC web config (see apps/web/.env.example)
 * AND fill the matching values into public/firebase-messaging-sw.js. */
// Type-only imports are erased at build, so the firebase runtime is NOT pulled into
// the eager bundle here. It is loaded with a dynamic import() below, and only once
// web push is actually configured — an unconfigured build ships none of it.
import type { FirebaseApp } from 'firebase/app';
import type { Messaging, MessagePayload } from 'firebase/messaging';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
// The Web Push key from Firebase Console → Cloud Messaging → Web configuration.
const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;

/** True only when every value web push needs is present. Missing any → stay off. */
function isConfigured(): boolean {
  return Boolean(
    config.apiKey && config.projectId && config.messagingSenderId && config.appId && vapidKey,
  );
}

let app: FirebaseApp | null = null;
let messaging: Messaging | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isConfigured()) return null;
  const { initializeApp } = await import('firebase/app');
  const { getMessaging, isSupported } = await import('firebase/messaging');
  // Safari/older browsers, or any context without a service worker, report false.
  if (!(await isSupported())) return null;
  if (!messaging) {
    app = app ?? initializeApp(config as Record<string, string>);
    messaging = getMessaging(app);
  }
  return messaging;
}

/** Request permission and return this browser's FCM token, or null if push is off,
 *  unsupported, or the user declined. Registers the background worker at the app
 *  base so it sits beside the PWA worker rather than fighting it for the root scope. */
export async function getWebPushToken(
  onForeground?: (payload: MessagePayload) => void,
): Promise<string | null> {
  const m = await getMessagingInstance();
  if (!m) return null;
  if (typeof Notification === 'undefined') return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  const { getToken, onMessage } = await import('firebase/messaging');
  const swReg = await navigator.serviceWorker.register(
    `${import.meta.env.BASE_URL}firebase-messaging-sw.js`,
  );
  const token = await getToken(m, { vapidKey, serviceWorkerRegistration: swReg });
  if (onForeground) onMessage(m, onForeground);
  return token || null;
}
