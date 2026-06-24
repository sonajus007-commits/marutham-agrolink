const express = require('express');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateOrderCode() {
  return 'ORD' + Math.floor(1000 + Math.random() * 9000);
}

// Stages at which an order can still be cancelled
const CANCELLABLE_STAGES = [0, 1]; // Order Placed, Packaged — not once picked up

// ── POST /orders  (consumer only) ────────────────────────────────────────────
// Body: { items: [{product_id, farmer_id, qty}], pay_method, address? }
router.post('/', async (req, res) => {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only consumers can place orders.' });
  }

  const { items, pay_method } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required and must not be empty.' });
  }
  if (!pay_method) {
    return res.status(400).json({ error: 'pay_method is required (UPI / Card / Cash on Delivery).' });
  }

  // ── 1. Resolve each item from the DB ─────────────────────────────────────
  const resolvedItems = [];
  let fulfilmentVillage = null;
  let fulfilmentDistrict = null;

  for (const item of items) {
    const { product_id, farmer_id, qty } = item;
    if (!product_id || !farmer_id || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Each item needs product_id, farmer_id, and qty > 0.' });
    }

    // Fetch farmer listing (price + availability)
    const { data: listing } = await supabase
      .from('farmer_listings')
      .select('farmer_price, qty_available, listed, bulk_qty, bulk_disc_pct')
      .eq('farmer_id', farmer_id)
      .eq('product_id', product_id)
      .single();

    if (!listing) {
      return res.status(404).json({ error: `No active listing found for product ${product_id} from farmer ${farmer_id}.` });
    }
    if (!listing.listed) {
      return res.status(400).json({ error: `Farmer's listing for product ${product_id} is currently unavailable.` });
    }
    if (listing.qty_available < qty) {
      return res.status(400).json({ error: `Insufficient stock for product ${product_id}. Available: ${listing.qty_available}.` });
    }

    // Fetch product details
    const { data: product } = await supabase
      .from('products')
      .select('id, code, name, unit, platform_fee_pct, available')
      .eq('id', product_id)
      .single();

    if (!product || !product.available) {
      return res.status(400).json({ error: `Product ${product_id} is not available.` });
    }

    // Fetch farmer info (name + village for fulfilment)
    const { data: farmer } = await supabase
      .from('users')
      .select('id, fname, lname, village_town, district')
      .eq('id', farmer_id)
      .single();

    if (!farmer) return res.status(404).json({ error: `Farmer ${farmer_id} not found.` });

    // Use first item's farmer village as fulfilment village
    if (!fulfilmentVillage) {
      fulfilmentVillage = farmer.village_town;
      fulfilmentDistrict = farmer.district;
    }

    // Fetch district market price for savings calculation
    const { data: distPrice } = await supabase
      .from('product_district_prices')
      .select('market_price, handling')
      .eq('product_id', product_id)
      .eq('district', farmer.district)
      .maybeSingle();

    // ── Price calculation (all in paise) ─────────────────────────────────
    let farmerPrice = listing.farmer_price;

    // Apply bulk discount if applicable
    if (listing.bulk_qty && qty >= listing.bulk_qty && listing.bulk_disc_pct) {
      farmerPrice = Math.round(farmerPrice * (1 - listing.bulk_disc_pct / 100));
    }

    const platformFeePct = product.platform_fee_pct ?? 5;
    const consumerPrice = Math.round(farmerPrice * (1 + platformFeePct / 100));
    const lineTotal = Math.round(consumerPrice * qty);
    const lineFarmerTotal = Math.round(farmerPrice * qty);
    const handling = distPrice?.handling ?? 0;
    const govtPrice = distPrice?.market_price ?? null;
    const savedLine = govtPrice ? Math.max(0, Math.round((govtPrice - consumerPrice) * qty)) : 0;

    resolvedItems.push({
      product_id,
      product_code: product.code,
      name: product.name,
      farmer_id,
      farmer_name: `${farmer.fname}${farmer.lname ? ' ' + farmer.lname : ''}`,
      qty,
      unit: product.unit,
      price: consumerPrice,
      farmer_price: farmerPrice,
      base_farmer_price: listing.farmer_price,
      govt_price: govtPrice,
      // computed totals used below
      _lineTotal: lineTotal,
      _lineFarmerTotal: lineFarmerTotal,
      _handling: handling,
      _saved: savedLine,
    });
  }

  // ── 2. Aggregate order totals ─────────────────────────────────────────────
  const item_total = resolvedItems.reduce((s, i) => s + i._lineTotal, 0);
  const handling   = resolvedItems.reduce((s, i) => s + i._handling, 0);
  const market_fee = resolvedItems.reduce((s, i) => s + (i._lineTotal - i._lineFarmerTotal), 0);
  const delivery   = 0; // set during delivery workflow
  const saved      = resolvedItems.reduce((s, i) => s + i._saved, 0);
  const total      = item_total + handling + delivery;

  // ── 3. Generate a unique order code ──────────────────────────────────────
  let code;
  let codeUnique = false;
  for (let attempt = 0; attempt < 5 && !codeUnique; attempt++) {
    code = generateOrderCode();
    const { data: existing } = await supabase
      .from('orders')
      .select('id')
      .eq('code', code)
      .maybeSingle();
    if (!existing) codeUnique = true;
  }
  if (!codeUnique) return res.status(500).json({ error: 'Could not generate unique order code. Try again.' });

  // ── 4. Insert order ───────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      code,
      consumer_id:   req.user.id,
      consumer_name: `${req.user.fname}${req.user.lname ? ' ' + req.user.lname : ''}`,
      district:      fulfilmentDistrict,
      village:       fulfilmentVillage,
      item_total, handling, market_fee, delivery, total, saved,
      pay_method,
      pay_status:    pay_method === 'Cash on Delivery' ? 'pending' : 'paid',
      stage:         0,
      status:        'Order Placed',
      route:         '',
    })
    .select()
    .single();

  if (orderErr) {
    console.error('POST /orders insert error:', orderErr);
    return res.status(500).json({ error: 'Could not place order.' });
  }

  // ── 5. Insert order items (strip internal _fields) ────────────────────────
  const itemRows = resolvedItems.map(({ _lineTotal, _lineFarmerTotal, _handling, _saved, ...rest }) => ({
    ...rest,
    order_id: order.id,
  }));

  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
  if (itemsErr) {
    console.error('POST /orders items insert error:', itemsErr);
    // Roll back the order
    await supabase.from('orders').delete().eq('id', order.id);
    return res.status(500).json({ error: 'Could not save order items.' });
  }

  // ── 6. Write first history entry ──────────────────────────────────────────
  await supabase.from('order_history').insert({
    order_id: order.id,
    label:    'Order Placed',
    note:     `Order ${code} placed by ${order.consumer_name}.`,
  });

  // ── 7. Reduce farmer listing quantities ──────────────────────────────────
  for (const item of resolvedItems) {
    const { data: listing } = await supabase
      .from('farmer_listings')
      .select('qty_available')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .single();

    if (listing) {
      await supabase
        .from('farmer_listings')
        .update({ qty_available: listing.qty_available - item.qty })
        .eq('farmer_id', item.farmer_id)
        .eq('product_id', item.product_id);
    }
  }

  res.status(201).json({ message: 'Order placed successfully.', order });
});

// ── GET /orders  (role-scoped) ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { village, district } = req.query;
  const u = req.user;

  let query = supabase
    .from('orders')
    .select('id, code, consumer_name, district, village, total, status, stage, route, pay_method, pay_status, created_at, agent_name')
    .order('created_at', { ascending: false });

  if (u.role === 'consumer') {
    query = query.eq('consumer_id', u.id);

  } else if (u.role === 'farmer') {
    // Orders that contain this farmer's produce
    const { data: farmerOrderIds } = await supabase
      .from('order_items')
      .select('order_id')
      .eq('farmer_id', u.id);

    const ids = (farmerOrderIds || []).map(r => r.order_id);
    if (ids.length === 0) return res.json({ orders: [] });
    query = query.in('id', ids);

  } else if (u.role === 'admin') {
    const role = u.admin_role;

    if (role === 'VCO') {
      query = query.eq('village', u.vco_city);

    } else if (role === 'District Manager' || role === 'Hub Incharge') {
      query = query.eq('district', u.district_assign || u.district);
      if (village) query = query.eq('village', village);

    } else if (role === 'Delivery Agent') {
      // Agent sees their assigned orders + pickup queue (stage 2 = VCO Verified, ready for pickup)
      query = query.or(`agent_id.eq.${u.id},stage.eq.2`);

    } else {
      // Head Office / State Head / Regional Manager — all orders
      if (district) query = query.eq('district', district);
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error('GET /orders error:', error);
    return res.status(500).json({ error: 'Could not fetch orders.' });
  }

  res.json({ orders: data });
});

// ── GET /orders/:id  (full detail) ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const identifier = req.params.id;

  // Accept both UUID and order code (e.g. ORD1234)
  const isCode = identifier.startsWith('ORD');
  let orderQuery = supabase
    .from('orders')
    .select('*');
  orderQuery = isCode
    ? orderQuery.eq('code', identifier)
    : orderQuery.eq('id', identifier);

  const { data: order, error } = await orderQuery.single();

  if (error || !order) return res.status(404).json({ error: 'Order not found.' });

  // Role guard: consumer can only see their own order
  if (req.user.role === 'consumer' && order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only view your own orders.' });
  }

  // Fetch items
  const { data: items } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);

  // Fetch status timeline
  const { data: history } = await supabase
    .from('order_history')
    .select('label, note, ts')
    .eq('order_id', order.id)
    .order('ts', { ascending: true });

  // QR token — signed with order code so the scan endpoint can trust it
  const qr_token = jwt.sign(
    { order_code: order.code },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ order, items, history, qr_token });
});

// ── POST /orders/:id/cancel  (consumer or admin) ──────────────────────────────
router.post('/:id/cancel', async (req, res) => {
  const u = req.user;
  if (u.role === 'farmer') {
    return res.status(403).json({ error: 'Farmers cannot cancel orders.' });
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found.' });

  // Consumers may only cancel their own orders
  if (u.role === 'consumer' && order.consumer_id !== u.id) {
    return res.status(403).json({ error: 'You can only cancel your own orders.' });
  }

  if (order.cancelled) {
    return res.status(400).json({ error: 'Order is already cancelled.' });
  }

  if (!CANCELLABLE_STAGES.includes(order.stage)) {
    return res.status(400).json({ error: 'Order cannot be cancelled once it has been picked up for delivery.' });
  }

  const { cancel_reason } = req.body;
  const now = new Date().toISOString();

  // Refund amount = full total if paid online
  const refund_amt = order.pay_status === 'paid' ? order.total : null;
  const refund_to  = refund_amt ? order.pay_method : null;

  const { data: updated, error: updateErr } = await supabase
    .from('orders')
    .update({
      cancelled:    true,
      cancel_reason: cancel_reason || null,
      cancelled_at:  now,
      refund_amt,
      refund_to,
      status:        'Cancelled',
      updated_at:    now,
    })
    .eq('id', order.id)
    .select()
    .single();

  if (updateErr) {
    console.error('Cancel order error:', updateErr);
    return res.status(500).json({ error: 'Could not cancel order.' });
  }

  // History entry
  await supabase.from('order_history').insert({
    order_id: order.id,
    label:    'Cancelled',
    note:     cancel_reason || 'Cancelled by ' + (u.role === 'consumer' ? 'consumer' : `admin (${u.admin_role})`),
  });

  // Restore farmer listing quantities
  const { data: orderItems } = await supabase
    .from('order_items')
    .select('farmer_id, product_id, qty')
    .eq('order_id', order.id);

  for (const item of orderItems || []) {
    const { data: listing } = await supabase
      .from('farmer_listings')
      .select('qty_available')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .single();

    if (listing) {
      await supabase
        .from('farmer_listings')
        .update({ qty_available: listing.qty_available + item.qty })
        .eq('farmer_id', item.farmer_id)
        .eq('product_id', item.product_id);
    }
  }

  res.json({
    message: 'Order cancelled.',
    order: updated,
    ...(refund_amt && { refund: { amount_paise: refund_amt, to: refund_to } }),
  });
});

module.exports = router;
