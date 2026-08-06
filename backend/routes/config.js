const express = require('express');
const supabase = require('../db/supabase');
const { requirePermission } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');

const router = express.Router();

// Both hours are coerced to integers in 0..23 and must differ. Replaces the manual
// parseInt / isNaN / range dance; the system_configuration 'edit' guard still runs
// first, so an unauthorised caller is 403'd before the body is ever inspected.
const orderingWindowSchema = z
  .object({
    open_hour: z.coerce
      .number({ message: 'open_hour and close_hour are required (0–23).' })
      .int('open_hour and close_hour must be integers 0–23.')
      .min(0, 'open_hour and close_hour must be integers 0–23.')
      .max(23, 'open_hour and close_hour must be integers 0–23.'),
    close_hour: z.coerce
      .number({ message: 'open_hour and close_hour are required (0–23).' })
      .int('open_hour and close_hour must be integers 0–23.')
      .min(0, 'open_hour and close_hour must be integers 0–23.')
      .max(23, 'open_hour and close_hour must be integers 0–23.'),
  })
  .refine((v) => v.open_hour !== v.close_hour, {
    message: 'open_hour and close_hour cannot be the same.',
    path: ['close_hour'],
  });

// In-memory config — resets on server restart.
// Default: ordering window 8 PM (20) to 8 AM (8) IST
let orderingWindow = { open_hour: 20, close_hour: 8 };

// ── GET /config/ordering-window ───────────────────────────────────────────────
router.get('/ordering-window', (req, res) => {
  res.json({ ordering_window: orderingWindow });
});

// ── PUT /config/ordering-window ───────────────────────────────────────────────
router.put('/ordering-window', requirePermission('system_configuration', 'edit'), validateBody(orderingWindowSchema), (req, res) => {
  const { open_hour, close_hour } = req.body;   // validated integers 0–23, guaranteed to differ
  orderingWindow = { open_hour, close_hour };
  res.json({ message: 'Ordering window updated.', ordering_window: orderingWindow });
});

// ── GET /config/stats  (public — counts only, no personal data) ───────────────
router.get('/stats', async (_req, res) => {
  try {
    const [sellersRes, consumersRes, districtsRes, statesRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true })
        .eq('role', 'farmer').eq('status', 'active'),
      supabase.from('users').select('id', { count: 'exact', head: true })
        .eq('role', 'consumer').eq('status', 'active'),
      supabase.from('users').select('district').not('district', 'is', null).neq('district', ''),
      supabase.from('users').select('state').not('state', 'is', null).neq('state', ''),
    ]);

    const activeSellers   = sellersRes.count   || 0;
    const happyCustomers  = consumersRes.count  || 0;
    const activeDistricts = new Set((districtsRes.data || []).map(r => r.district.trim().toLowerCase())).size;
    const activeStates    = new Set((statesRes.data    || []).map(r => r.state.trim().toLowerCase())).size;

    res.json({ activeSellers, happyCustomers, activeDistricts, activeStates });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
