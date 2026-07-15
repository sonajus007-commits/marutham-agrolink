/* Firebase Cloud Messaging — background message handler (web push).
 *
 * This runs in its OWN service-worker scope and cannot read Vite env, so the config
 * below must be filled in by hand. These values are your Firebase project's PUBLIC
 * web config — NOT secrets; they ship in every Firebase web app — so they are safe
 * to commit. Use a TEST Firebase project (no production plan yet).
 *
 * Until the REPLACE_ME values are filled, leave web push off: src/push/webPush.ts
 * also no-ops without VITE_FIREBASE_*, so this worker is never registered and the
 * placeholder does no harm.
 *
 * Keep the SDK version here in step with the `firebase` package in package.json
 * (currently 12.16.0). */
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME',
  projectId: 'REPLACE_ME',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
});

const messaging = firebase.messaging();

// Fired when a push arrives while no tab is focused. Draw the notification the OS shows.
messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || 'Marutham AgroLink', {
    body: n.body || '',
    icon: '/app/icons/pwa-192.png',
    badge: '/app/icons/pwa-192.png',
  });
});
