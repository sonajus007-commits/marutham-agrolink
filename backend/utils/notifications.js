// ─────────────────────────────────────────────────────────────────────────────
// In-app notification feed (migration 053).
//
// A single place to drop a notification onto a user's bell. Every caller is a
// side-effect of a business event that ALREADY succeeded (an order was placed, a
// payout settled), so this is deliberately BEST-EFFORT: a failure here is logged
// and swallowed, never thrown, so a notification hiccup can never fail or reverse
// the action that triggered it. (Express 4 does not catch async throws — an
// unhandled rejection here would take the process down; see project_route_tests.)
//
// Push (FCM) and email/SMS are separate channels that ride the same events; this
// is the always-on one that needs no external service.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('../db/supabase');

// Create one notification. `data` is a small routing payload (e.g. {order_id, code})
// the client uses to deep-link the bell item. Returns nothing meaningful — callers
// must not depend on the result.
async function notify(userId, { type, title, body = null, data = {} }) {
  if (!userId || !type || !title) return;
  try {
    const { error } = await supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      body,
      data: data || {},
    });
    if (error) console.error(`notify(${type}) insert failed:`, error.message);
  } catch (e) {
    console.error(`notify(${type}) threw:`, e && e.message);
  }
}

// Fan the same notification out to several users (a broadcast, or every seller on a
// multi-vendor order). De-duplicates and drops empties. One insert, best-effort.
async function notifyMany(userIds, { type, title, body = null, data = {} }) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0 || !type || !title) return;
  try {
    const rows = ids.map((user_id) => ({ user_id, type, title, body, data: data || {} }));
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error(`notifyMany(${type}) insert failed:`, error.message);
  } catch (e) {
    console.error(`notifyMany(${type}) threw:`, e && e.message);
  }
}

module.exports = { notify, notifyMany };
