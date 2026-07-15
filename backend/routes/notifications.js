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

module.exports = router;
