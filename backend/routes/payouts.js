const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { groupPayouts } = require('../utils/payouts');

const router = express.Router();
router.use(requireAuth);

// ── GET /payouts  (farmer = own; admin = all or scoped) ───────────────────────
router.get('/', async (req, res) => {
  let query = supabase
    .from('payouts')
    .select(`
      id, amount, status, method, reference, created_at, paid_at,
      farmer:users ( id, fname, lname, phone, bank_name, bank_account, ifsc ),
      order:orders ( id, code )
    `)
    .order('created_at', { ascending: false });

  if (req.user.role === 'farmer') {
    query = query.eq('farmer_id', req.user.id);
  } else if (req.user.role === 'admin') {
    // District-scoped admins see payouts for farmers in their district
    if (['District Manager', 'Hub Incharge'].includes(req.user.admin_role)) {
      const district = req.user.district_assign || req.user.district;
      // Filter via farmers in this district
      const { data: districtFarmers } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'farmer')
        .eq('district', district);
      const ids = (districtFarmers || []).map(f => f.id);
      if (ids.length === 0) return res.json({ payouts: [] });
      query = query.in('farmer_id', ids);
    }
    // Head Office / State / Regional → all payouts (no extra filter)
  } else {
    return res.status(403).json({ error: 'Access denied.' });
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not fetch payouts.' });

  res.json({ payouts: data });
});

// ── POST /payouts/run  (admin only — trigger settlement batch) ────────────────
// Creates pending payout records for all delivered orders that don't have one yet.
router.post('/run', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can trigger payouts.' });
  }

  // Fetch delivered order items that haven't been paid out yet
  const { data: deliveredOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('status', 'Delivered')
    .eq('cancelled', false);

  if (!deliveredOrders || deliveredOrders.length === 0) {
    return res.json({ message: 'No delivered orders to settle.', created: 0 });
  }

  const orderIds = deliveredOrders.map(o => o.id);

  // Get already-paid-out order IDs so we don't double-pay
  const { data: existingPayouts } = await supabase
    .from('payouts')
    .select('order_id')
    .in('order_id', orderIds);

  const alreadyPaidOrderIds = new Set((existingPayouts || []).map(p => p.order_id));
  const unpaidOrderIds = orderIds.filter(id => !alreadyPaidOrderIds.has(id));

  if (unpaidOrderIds.length === 0) {
    return res.json({ message: 'All delivered orders are already settled.', created: 0 });
  }

  // Fetch order items for unpaid orders, grouped by farmer
  const { data: items } = await supabase
    .from('order_items')
    .select('order_id, farmer_id, farmer_price, qty')
    .in('order_id', unpaidOrderIds);

  if (!items || items.length === 0) {
    return res.json({ message: 'No items found for settlement.', created: 0 });
  }

  // Aggregate payout amount per farmer per order. Shared with the per-order
  // figure on GET /orders so the two cannot disagree.
  const payoutRows = groupPayouts(items).map(p => ({
    farmer_id: p.farmer_id,
    order_id:  p.order_id,
    amount:    p.amount,
    status:    'pending',
    method:    'bank_transfer',
  }));

  const { data: created, error } = await supabase
    .from('payouts')
    .insert(payoutRows)
    .select();

  if (error) {
    console.error('Payout run error:', error);
    return res.status(500).json({ error: 'Could not create payout records.' });
  }

  res.status(201).json({
    message: `Settlement batch created. ${created.length} payout record(s) queued as pending.`,
    created: created.length,
    payouts: created,
  });
});

module.exports = router;
