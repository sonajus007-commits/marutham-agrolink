const express = require('express');
const supabase = require('../db/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

const DISTRICT_ROLES = new Set(['District Manager', 'VCO', 'Delivery Agent', 'Hub Incharge']);
const REGION_ROLES   = new Set(['Regional Manager']);

// ── GET /consumers ────────────────────────────────────────────────────────────
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const u = req.user;

    let q = supabase
      .from('users')
      .select('id, fname, lname, phone, email, village_town, district, state, status, created_at')
      .eq('role', 'consumer')
      .order('created_at', { ascending: false });

    if (DISTRICT_ROLES.has(u.admin_role)) q = q.eq('district', u.district);
    else if (REGION_ROLES.has(u.admin_role)) q = q.eq('state', u.state);

    const { data: consumers, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    if (!consumers || consumers.length === 0) return res.json({ consumers: [] });

    const consumerIds = consumers.map(c => c.id);

    // Order stats per consumer
    const { data: orders } = await supabase
      .from('orders')
      .select('consumer_id, total, status, cancelled')
      .in('consumer_id', consumerIds);

    const orderMap = {};
    (orders || []).forEach(o => {
      const cid = o.consumer_id;
      if (!orderMap[cid]) orderMap[cid] = { total_orders: 0, delivered: 0, total_spend: 0 };
      orderMap[cid].total_orders++;
      if (o.status === 'Delivered') {
        orderMap[cid].delivered++;
        orderMap[cid].total_spend += parseFloat(o.total || 0);
      }
    });

    const result = consumers.map(c => ({
      ...c,
      total_orders:  (orderMap[c.id] || {}).total_orders || 0,
      delivered:     (orderMap[c.id] || {}).delivered    || 0,
      total_spend:   Math.round((orderMap[c.id] || {}).total_spend || 0), // paise; middleware converts
    }));

    res.json({ consumers: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /consumers/:id/block ────────────────────────────────────────────────
router.patch('/:id/block', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .update({ status: 'blocked', updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('role', 'consumer')
    .select('id, fname').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Consumer blocked.', user: data });
});

// ── PATCH /consumers/:id/unblock ──────────────────────────────────────────────
router.patch('/:id/unblock', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', req.params.id).eq('role', 'consumer')
    .select('id, fname').single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Consumer unblocked.', user: data });
});

module.exports = router;
