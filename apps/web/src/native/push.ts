/* FCM push notifications for the native shell, via @capacitor/push-notifications.
 *
 * Prerequisites you must supply outside the JS (there is no way to scaffold these
 * from here — they are per-project secrets):
 *   • Android: a Firebase project, with android/app/google-services.json in place
 *     and the Google Services Gradle plugin applied (Capacitor's docs cover the two
 *     one-line Gradle edits).
 *   • iOS: an APNs auth key uploaded to that same Firebase project, plus the Push
 *     Notifications capability enabled in Xcode.
 *
 * Call registerPush() AFTER sign-in, so the token can be sent to the backend against
 * a known user. Returns the FCM/APNs token, or null if permission was denied or the
 * app is running in a browser. */
import { Capacitor } from '@capacitor/core';
import { PushNotifications, type PushNotificationSchema } from '@capacitor/push-notifications';

export type PushMessageHandler = (message: PushNotificationSchema) => void;

export async function registerPush(onMessage?: PushMessageHandler): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return null;

  const token = await new Promise<string | null>((resolve) => {
    // registration / registrationError resolve the token exactly once.
    const done = (value: string | null) => {
      void PushNotifications.removeAllListeners();
      resolve(value);
    };
    void PushNotifications.addListener('registration', (t) => done(t.value));
    void PushNotifications.addListener('registrationError', (err) => {
      console.error('[push] registration failed', err);
      done(null);
    });
    void PushNotifications.register();
  });

  if (onMessage) {
    // Foreground delivery; taps that open the app arrive on pushNotificationActionPerformed.
    await PushNotifications.addListener('pushNotificationReceived', onMessage);
  }

  return token;
}

/** Stop all push listeners — call on sign-out. */
export async function unregisterPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await PushNotifications.removeAllListeners();
}
