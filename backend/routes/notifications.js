const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { validateBody, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// A registration token from FCM (Android) or APNs-via-Firebase (iOS), or a Web Push
// endpoint. Any signed-in role may register one — a push is addressed to a person,
// not a role. Bounded length so a malformed client cannot post a megabyte of text.
const deviceSchema = z.object({
  token: z.string().min(1, 'A device token is required.').max(4096),
  platform: z.enum(['android', 'ios', 'web'], {
    message: 'platform must be one of android, ios, web.',
  }),
});

// ── POST /notifications/device ── register (or re-point) this device's push token ─
// Upsert on the token: a device holds one token, and if it changes hands to another
// signed-in user the same token is reassigned to them rather than duplicated.
router.post('/device', validateBody(deviceSchema), async (req, res) => {
  const { token, platform } = req.body;

  const { error } = await supabase.from('device_tokens').upsert(
    {
      user_id: req.user.id,
      token,
      platform,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'token' },
  );

  if (error) {
    console.error('POST /notifications/device upsert failed:', error.message);
    return res.status(500).json({ error: 'Could not register this device. Please try again.' });
  }

  return res.status(200).json({ message: 'Device registered for notifications.' });
});

// ── DELETE /notifications/device ── drop this device's token (called on sign-out) ─
// Scoped to the caller's own rows: you can only unregister a token registered to you.
router.delete('/device', validateBody(z.object({ token: z.string().min(1).max(4096) })), async (req, res) => {
  const { error } = await supabase
    .from('device_tokens')
    .delete()
    .eq('token', req.body.token)
    .eq('user_id', req.user.id);

  if (error) {
    console.error('DELETE /notifications/device failed:', error.message);
    return res.status(500).json({ error: 'Could not unregister this device. Please try again.' });
  }

  return res.status(200).json({ message: 'Device unregistered.' });
});

// ── GET /notifications ── the signed-in user's feed, newest first ────────────────
// Scoped to the caller: a user only ever reads their own bell. Bounded page so the
// bell never pulls the whole history; `unread` rides along so the client can render
// the badge from the same call.
router.get('/', async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, data, read_at, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    console.error('GET /notifications failed:', error.message);
    return res.status(500).json({ error: 'Could not load notifications.' });
  }

  const { count, error: cErr } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .is('read_at', null);
  if (cErr) console.error('GET /notifications unread count failed:', cErr.message);

  return res.json({ notifications: data || [], unread: count || 0, limit, offset });
});

// ── GET /notifications/unread-count ── cheap badge poll ──────────────────────────
router.get('/unread-count', async (req, res) => {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', req.user.id)
    .is('read_at', null);
  if (error) {
    console.error('GET /notifications/unread-count failed:', error.message);
    return res.status(500).json({ error: 'Could not load unread count.' });
  }
  return res.json({ unread: count || 0 });
});

// ── POST /notifications/read ── mark one (by id) or all read ─────────────────────
// Body: { id } marks that one; { all: true } marks every unread. Always scoped to
// the caller's own rows, so one user can never touch another's bell.
router.post(
  '/read',
  validateBody(z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() })),
  async (req, res) => {
    const { id, all } = req.body;
    if (!id && !all) {
      return res.status(400).json({ error: 'Pass an id, or all: true.' });
    }
    let q = supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', req.user.id)
      .is('read_at', null); // only flip unread → read; re-reading is a no-op
    if (id) q = q.eq('id', id);
    const { error } = await q;
    if (error) {
      console.error('POST /notifications/read failed:', error.message);
      return res.status(500).json({ error: 'Could not update notifications.' });
    }
    return res.json({ ok: true });
  },
);

module.exports = router;
