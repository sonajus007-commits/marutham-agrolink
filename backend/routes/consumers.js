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
      .select('id, consumer_id, total, status, cancelled')
      .in('consumer_id', consumerIds);

    const orderMap = {};
    const orderToConsumer = {};   // order_id → consumer_id, for return attribution
    (orders || []).forEach(o => {
      const cid = o.consumer_id;
      orderToConsumer[o.id] = cid;
      if (!orderMap[cid]) orderMap[cid] = { total_orders: 0, delivered: 0, total_spend: 0, returned: 0 };
      orderMap[cid].total_orders++;
      if (o.status === 'Delivered') {
        orderMap[cid].delivered++;
        orderMap[cid].total_spend += parseFloat(o.total || 0);
      }
    });

    // Returns per consumer (one return row per order → count = returned orders)
    const orderIds = (orders || []).map(o => o.id);
    if (orderIds.length) {
      const { data: returns } = await supabase
        .from('returns')
        .select('order_id')
        .in('order_id', orderIds);
      (returns || []).forEach(r => {
        const cid = orderToConsumer[r.order_id];
        if (cid && orderMap[cid]) orderMap[cid].returned++;
      });
    }

    const result = consumers.map(c => ({
      ...c,
      total_orders:  (orderMap[c.id] || {}).total_orders || 0,
      delivered:     (orderMap[c.id] || {}).delivered    || 0,
      returned:      (orderMap[c.id] || {}).returned      || 0,
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

// ── GET /consumers/:id/frequent ───────────────────────────────────────────────
// Products this consumer has ordered 2+ times, most-ordered first (top 6).
// "Ordered N times" = number of distinct orders that contain the product.
router.get('/:id/frequent', requireRole('admin'), async (req, res) => {
  try {
    const consumerId = req.params.id;

    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id')
      .eq('consumer_id', consumerId);
    if (oErr) return res.status(500).json({ error: oErr.message });

    const orderIds = (orders || []).map(o => o.id);
    if (!orderIds.length) return res.json({ frequent: [] });

    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select('order_id, product_id, name')
      .in('order_id', orderIds);
    if (iErr) return res.status(500).json({ error: iErr.message });

    // Group by product; count distinct orders it appears in.
    const byProduct = {};
    (items || []).forEach(it => {
      const key = it.product_id || it.name;
      if (!key) return;
      if (!byProduct[key]) byProduct[key] = { name: it.name || 'Product', orders: new Set() };
      byProduct[key].orders.add(it.order_id);
    });

    const frequent = Object.values(byProduct)
      .map(p => ({ name: p.name, count: p.orders.size }))
      .filter(p => p.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    res.json({ frequent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /consumers/:id/activity ───────────────────────────────────────────────
// Order + return history for the profile popup's stat-detail pane.
router.get('/:id/activity', requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;

    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id, code, created_at, status, total, cancelled')
      .eq('consumer_id', id)
      .order('created_at', { ascending: false });
    if (oErr) return res.status(500).json({ error: oErr.message });

    const orderIds = (orders || []).map(o => o.id);
    const codeById = {};
    (orders || []).forEach(o => { codeById[o.id] = o.code; });

    let returns = [];
    if (orderIds.length) {
      const { data: rets } = await supabase
        .from('returns')
        .select('code, order_id, requested_at, decision, refund_amt')
        .in('order_id', orderIds)
        .order('requested_at', { ascending: false });
      returns = (rets || []).map(r => ({
        code: r.code,
        order_code: codeById[r.order_id] || '—',
        requested_at: r.requested_at,
        decision: r.decision,
        refund_amt: r.refund_amt,
      }));
    }

    res.json({ orders: orders || [], returns });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
