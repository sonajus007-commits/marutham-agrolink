const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { generateReturnCode } = require('../utils/codeGen');
const {
  RETURN_WINDOW_HOURS,
  isWithinReturnWindow,
  resolveReturnLines,
  deriveFullReturn,
  computeRefundPaise,
  buildReturnLineRows,
} = require('../utils/returns');

const router = express.Router();
router.use(requireAuth);

// ── POST /orders/:id/return  (consumer, within return window) ─────────────────
// Body: { full_return?, lines: [{ order_item_id, qty?, reason }], photos?: [url] }
//
// Money and item details are NEVER taken from the request. `price`, `name`,
// `farmer_name` etc. are read from order_items, and refund_amt is computed in
// paise server-side. The client previously echoed back the rupee-converted
// prices it received (convertMoney runs on responses but not on requests), so
// a partial refund came out 100x too small — and the amount was forgeable.
router.post('/:id/return', async (req, res) => {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only consumers can request returns.' });
  }

  const { data: order } = await supabase
    .from('orders')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only return your own orders.' });
  }
  if (order.status !== 'Delivered') {
    return res.status(400).json({ error: 'Returns can only be requested after delivery.' });
  }
  if (order.cancelled) {
    return res.status(400).json({ error: 'Order is cancelled.' });
  }

  // Check return window
  if (!isWithinReturnWindow(order.delivered_at)) {
    return res.status(400).json({ error: `Return window has closed. Returns must be requested within ${RETURN_WINDOW_HOURS} hours of delivery.` });
  }

  // Check if a return already exists for this order
  const { data: existing } = await supabase
    .from('returns')
    .select('id')
    .eq('order_id', order.id)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'A return has already been requested for this order.' });

  const { full_return: wantsFull = false, lines = [], photos = [] } = req.body;

  if (!wantsFull && lines.length === 0) {
    return res.status(400).json({ error: 'Provide either full_return: true or at least one item in lines.' });
  }

  const { data: items } = await supabase
    .from('order_items')
    .select('id, product_code, name, farmer_name, qty, unit, price')
    .eq('order_id', order.id);

  // Build the authoritative line set. `full_return: true` with no lines means
  // "everything"; otherwise each requested line is matched to a real order item.
  const { resolved, error: resolveErr } = resolveReturnLines(items, lines, req.body.reason || null);
  if (resolveErr) return res.status(400).json({ error: resolveErr });

  const full_return = deriveFullReturn(items, resolved);
  const refund_amt = computeRefundPaise(order, resolved, full_return);

  // Generate return code (inherits district code + date from parent order)
  let code;
  try {
    code = await generateReturnCode(supabase, order.code);
  } catch (err) {
    console.error('generateReturnCode error:', err);
    return res.status(500).json({ error: err.message || 'Could not generate return code.' });
  }

  const { data: ret, error: retErr } = await supabase
    .from('returns')
    .insert({
      code,
      order_id:    order.id,
      full_return,
      refund_amt,
      refund_to:   order.pay_method,
    })
    .select()
    .single();

  if (retErr) {
    console.error('POST /return error:', retErr);
    return res.status(500).json({ error: 'Could not create return request.' });
  }

  // Insert return lines, copying the item details from order_items. A failure
  // here used to be swallowed, leaving a refund request with no items on it.
  const { error: lineErr } = await supabase.from('return_lines').insert(buildReturnLineRows(ret.id, resolved));
  if (lineErr) {
    console.error('POST /return lines error:', lineErr);
    // Don't leave an itemless return behind.
    await supabase.from('returns').delete().eq('id', ret.id);
    return res.status(500).json({ error: 'Could not record the returned items.' });
  }

  if (photos.length > 0) {
    const photoRows = photos.map(url => ({ return_id: ret.id, url }));
    const { error: photoErr } = await supabase.from('return_photos').insert(photoRows);
    if (photoErr) console.error('POST /return photos error:', photoErr);
  }

  res.status(201).json({ message: 'Return requested successfully.', return: ret, code });
});

// ── GET /returns  (VCO/admin scoped) ─────────────────────────────────────────
router.get('/', async (req, res) => {
  if (req.user.role === 'consumer' || req.user.role === 'farmer') {
    return res.status(403).json({ error: 'Only admins can list returns.' });
  }

  let query = supabase
    .from('returns')
    .select(`
      id, code, full_return, decision, collected, refund_amt, refund_to, requested_at, decided_at,
      order:orders ( id, code, consumer_name, village, district )
    `)
    .order('requested_at', { ascending: false });

  // VCO sees only returns from their village
  if (req.user.admin_role === 'VCO') {
    query = query.eq('order.village', req.user.village_town || req.user.vco_city);
  } else if (['District Manager', 'Hub Incharge'].includes(req.user.admin_role)) {
    query = query.eq('order.district', req.user.district_assign || req.user.district);
  }
  // Head Office / State / Regional → all

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not fetch returns.' });

  res.json({ returns: data });
});

// ── PATCH /returns/:id/decide  (VCO or admin) ────────────────────────────────
router.patch('/:id/decide', async (req, res) => {
  const u = req.user;
  if (u.role !== 'admin') return res.status(403).json({ error: 'Only admins can decide on returns.' });

  const { decision } = req.body;
  if (!['accepted', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "accepted" or "rejected".' });
  }

  const { data: ret } = await supabase
    .from('returns')
    .select('id, decision')
    .eq('id', req.params.id)
    .single();

  if (!ret) return res.status(404).json({ error: 'Return not found.' });
  if (ret.decision) return res.status(400).json({ error: `Return has already been ${ret.decision}.` });

  const { data: updated, error } = await supabase
    .from('returns')
    .update({ decision, decided_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Could not update return decision.' });

  res.json({ message: `Return ${decision}.`, return: updated });
});

// ── PATCH /returns/:id/collect  (VCO / Agent / Admin) ────────────────────────
// Marks goods collected and triggers the refund record
router.patch('/:id/collect', async (req, res) => {
  const u = req.user;
  if (u.role !== 'admin') return res.status(403).json({ error: 'Only admins can mark returns as collected.' });

  const { data: ret } = await supabase
    .from('returns')
    .select('*, order:orders(id, consumer_id, pay_method)')
    .eq('id', req.params.id)
    .single();

  if (!ret) return res.status(404).json({ error: 'Return not found.' });
  if (ret.decision !== 'accepted') {
    return res.status(400).json({ error: 'Return must be accepted before marking as collected.' });
  }
  if (ret.collected) return res.status(400).json({ error: 'Return is already marked as collected.' });

  const { data: updated, error } = await supabase
    .from('returns')
    .update({ collected: true })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Could not mark return as collected.' });

  res.json({
    message: 'Return collected. Refund triggered.',
    return: updated,
    refund: {
      amount_paise: ret.refund_amt,
      to: ret.refund_to,
    },
  });
});

module.exports = router;
