// ─────────────────────────────────────────────────────────────────────────────
// Phone push (FCM) — the second channel riding the same events as the in-app bell.
//
// utils/notifications.js writes the bell row; right after, it hands the same
// title/body here so every device the user registered (device_tokens, migration
// 028) gets a system notification too. Same contract as the bell: BEST-EFFORT.
// Nothing here ever throws — a push outage must not fail or reverse the business
// action that triggered it (Express 4 does not catch async throws).
//
// OFF unless configured: FIREBASE_SERVICE_ACCOUNT_PATH must point at the Firebase
// Admin SDK service-account JSON (Project settings → Service accounts). That file
// is a private key — git-ignored, never committed (the repo is public). With it
// unset (CI, tests, a fresh clone) push is a silent no-op and the bell still works.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('fs');
const path = require('path');
const supabase = require('../db/supabase');

// FCM rejects a multicast of more than 500 tokens.
const FCM_BATCH = 500;

// FCM's verdict that a token is dead for good (app uninstalled, token rotated,
// wrong project). Those rows are deleted so we stop paying for them on every send.
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  // NOT 'messaging/invalid-argument': a malformed PAYLOAD fails every token with
  // that code, and treating it as dead would wipe every healthy device.
]);

// undefined = not tried yet; null = disabled (no/invalid config); else the client.
let messaging;

function getMessaging() {
  if (messaging !== undefined) return messaging;
  messaging = null;
  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath) return messaging;
  try {
    const resolved = path.resolve(__dirname, '..', keyPath);
    const serviceAccount = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
    messaging = require('firebase-admin/messaging').getMessaging(app);
    console.log(`[push] FCM enabled for project ${serviceAccount.project_id}`);
  } catch (e) {
    // Misconfigured key: log once and stay off rather than retry on every event.
    console.error('[push] FCM disabled — could not load service account:', e && e.message);
  }
  return messaging;
}

// FCM data payloads must be flat string→string maps.
function stringifyData(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  }
  return out;
}

// Push one notification to every registered device of these users.
async function pushToUsers(userIds, { type, title, body = null, data = {} }) {
  const client = getMessaging();
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!client || ids.length === 0 || !title) return;
  try {
    const { data: rows, error } = await supabase
      .from('device_tokens')
      .select('token')
      .in('user_id', ids);
    if (error) {
      console.error(`[push] ${type} token read failed:`, error.message);
      return;
    }
    const tokens = [...new Set((rows || []).map((r) => r.token).filter(Boolean))];
    if (tokens.length === 0) return;

    const payload = {
      notification: { title, ...(body ? { body } : {}) },
      data: { ...stringifyData(data), type: String(type || '') },
      android: { priority: 'high' },
    };

    const dead = [];
    for (let i = 0; i < tokens.length; i += FCM_BATCH) {
      const batch = tokens.slice(i, i + FCM_BATCH);
      const res = await client.sendEachForMulticast({ ...payload, tokens: batch });
      res.responses.forEach((r, j) => {
        if (!r.success && r.error && DEAD_TOKEN_CODES.has(r.error.code)) dead.push(batch[j]);
      });
      if (res.failureCount > 0) {
        console.warn(`[push] ${type}: ${res.failureCount}/${batch.length} failed`);
      }
    }

    if (dead.length) {
      const { error: delErr } = await supabase.from('device_tokens').delete().in('token', dead);
      if (delErr) console.error('[push] dead-token cleanup failed:', delErr.message);
    }
  } catch (e) {
    console.error(`[push] ${type} threw:`, e && e.message);
  }
}

// Tests inject a fake messaging client (or null to force "disabled").
function _setMessagingForTest(client) {
  messaging = client;
}

module.exports = { pushToUsers, _setMessagingForTest };
