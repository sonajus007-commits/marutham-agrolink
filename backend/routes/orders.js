const express = require('express');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { generateOrderCode } = require('../utils/codeGen');
const { getFeeForSeller } = require('../utils/fees');
const { payoutByOrder } = require('../utils/payouts');

const router = express.Router();
router.use(requireAuth);

// ── Helpers ───────────────────────────────────────────────────────────────────

// Stages at which an order can still be cancelled
const CANCELLABLE_STAGES = [0, 1]; // Order Placed, Packaged — not once picked up

// ── POST /orders  (consumer only) ────────────────────────────────────────────
// Body: { items: [{product_id, farmer_id, qty}], pay_method, address? }
router.post('/', async (req, res) => {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only consumers can place orders.' });
  }

  const { items, pay_method, delivery_fee: clientDeliveryFee, delivery_address } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items array is required and must not be empty.' });
  }
  if (!pay_method) {
    return res.status(400).json({ error: 'pay_method is required (UPI / Card / Cash on Delivery).' });
  }

  // ── Ordering window: 8 PM – 8 AM IST only ────────────────────────────────
  // DISABLED FOR TESTING — re-enable by uncommenting the block below
  // const nowIST  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  // const hourIST = nowIST.getUTCHours();
  // if (hourIST >= 8 && hourIST < 20) {
  //   return res.status(400).json({
  //     error: 'Orders can only be placed between 8 PM and 8 AM. The ordering window opens at 8 PM IST.',
  //   });
  // }

  // ── 1. Resolve each item from the DB ─────────────────────────────────────
  const resolvedItems = [];
  let fulfilmentVillage = null;
  let fulfilmentDistrict = null;

  for (const item of items) {
    const { product_id, farmer_id, qty } = item;
    if (!product_id || !farmer_id || !qty || qty <= 0) {
      return res.status(400).json({ error: 'Each item needs product_id, farmer_id, and qty > 0.' });
    }

    // Fetch farmer listing (price + availability).
    // maybeSingle, not single: `.single()` errors when it matches nothing, so a
    // genuine database fault and "no such listing" were indistinguishable — and
    // every fault was reported to the customer as a missing product.
    const { data: listing, error: listingErr } = await supabase
      .from('farmer_listings')
      .select('farmer_price, qty_available, listed, confirmed, bulk_qty, bulk_disc_pct')
      .eq('farmer_id', farmer_id)
      .eq('product_id', product_id)
      .maybeSingle();

    if (listingErr) {
      console.error('POST /orders listing lookup failed:', listingErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }
    if (!listing) {
      return res.status(404).json({ error: `No active listing found for product ${product_id} from farmer ${farmer_id}.` });
    }
    if (!listing.listed) {
      return res.status(400).json({ error: `Farmer's listing for product ${product_id} is currently unavailable.` });
    }
    if (!listing.confirmed) {
      return res.status(400).json({ error: `Farmer has not confirmed availability for product ${product_id} for tomorrow.` });
    }
    if (listing.qty_available < qty) {
      return res.status(400).json({ error: `Insufficient stock for product ${product_id}. Available: ${listing.qty_available}.` });
    }

    // Fetch product details
    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('id, code, name, unit, platform_fee_pct, available, exotic')
      .eq('id', product_id)
      .maybeSingle();

    if (productErr) {
      console.error('POST /orders product lookup failed:', productErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }
    if (!product || !product.available) {
      return res.status(400).json({ error: `Product ${product_id} is not available.` });
    }

    // Fetch seller info (name + village for fulfilment + seller_type for fee)
    const { data: farmer, error: farmerErr } = await supabase
      .from('users')
      .select('id, fname, lname, village_town, district, seller_type')
      .eq('id', farmer_id)
      .maybeSingle();

    if (farmerErr) {
      console.error('POST /orders seller lookup failed:', farmerErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }
    if (!farmer) return res.status(404).json({ error: `Farmer ${farmer_id} not found.` });

    // Use first item's farmer village as fulfilment village
    if (!fulfilmentVillage) {
      fulfilmentVillage = farmer.village_town;
      fulfilmentDistrict = farmer.district;
    }

    // Fetch district market price for savings calculation
    // A MISSING row is legitimate — not every district carries a price, and the
    // `?? 0` fallbacks below are correct for that. A FAILED read is not: it takes
    // the same path, silently dropping `handling` (a real charge) to zero and the
    // savings figure to nothing. Undercharging is not an acceptable failure mode
    // for a query that didn't run.
    const { data: distPrice, error: distPriceErr } = await supabase
      .from('product_district_prices')
      .select('market_price, handling')
      .eq('product_id', product_id)
      .eq('district', farmer.district)
      .maybeSingle();

    if (distPriceErr) {
      console.error('POST /orders district price lookup failed:', distPriceErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }

    // ── Price calculation (all in paise) ─────────────────────────────────
    let farmerPrice = listing.farmer_price;

    // Apply bulk discount if applicable
    if (listing.bulk_qty && qty >= listing.bulk_qty && listing.bulk_disc_pct) {
      farmerPrice = Math.round(farmerPrice * (1 - listing.bulk_disc_pct / 100));
    }

    // Fee is seller-type-aware: Farmers 5%, Retailers 10%
    const platformFeePct = getFeeForSeller(farmer.seller_type);
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
      _exotic: !!product.exotic,
      _saved: savedLine,
    });
  }

  // ── 2. Aggregate order totals (all paise) ──────────────────────────────────
  const item_total = resolvedItems.reduce((s, i) => s + i._lineTotal, 0);

  // Handling: charged ONCE per order — the highest district handling among the
  // cart's exotic items (not per-line, not per-unit). Non-exotic items = no handling.
  const handling = resolvedItems.reduce((mx, i) => (i._exotic ? Math.max(mx, i._handling) : mx), 0);

  // Platform-fee revenue (consumer markup over farmer price). Already baked into
  // item_total via consumerPrice — recorded here for revenue reporting only.
  const market_fee = resolvedItems.reduce((s, i) => s + (i._lineTotal - i._lineFarmerTotal), 0);

  // Market fee: flat ₹10, charged once, only when the cart spans 2+ farmers.
  // Folded into total (not a stored column) — derivable as total−item_total−handling−delivery.
  const distinctFarmers  = new Set(resolvedItems.map(i => i.farmer_id)).size;
  const multiFarmerFee   = distinctFarmers >= 2 ? 1000 : 0;

  // Delivery: computed on the SERVER (client value ignored) — flat ₹25 below ₹150,
  // FREE at ₹150 and above.
  const delivery = item_total === 0 ? 0 : (item_total >= 15000 ? 0 : 2500);

  const saved = resolvedItems.reduce((s, i) => s + i._saved, 0);
  const total = item_total + handling + delivery + multiFarmerFee;

  // ── 3. Generate order code (atomic via DB function) ─────────────────────
  if (!req.user.district) {
    return res.status(400).json({ error: 'Your profile has no district set. Update your profile before ordering.' });
  }
  let code;
  try {
    code = await generateOrderCode(supabase, req.user.district);
  } catch (err) {
    console.error('generateOrderCode error:', err);
    return res.status(500).json({ error: 'Could not generate order code. Ensure the code_counters migration has been applied.' });
  }

  // Delivery-side village (consumer): chosen delivery address, else profile village.
  // Drives the hub → doorstep agent matching (Phase C), distinct from the farmer's
  // fulfilment `village` above.
  const deliveryVillage = (delivery_address && delivery_address.village_town) || req.user.village_town || null;

  // ── 4. Insert order ───────────────────────────────────────────────────────
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      code,
      consumer_id:   req.user.id,
      consumer_name: `${req.user.fname}${req.user.lname ? ' ' + req.user.lname : ''}`,
      district:      fulfilmentDistrict,
      village:       fulfilmentVillage,
      delivery_village: deliveryVillage,
      item_total, handling, market_fee, delivery, total, saved,
      pay_method,
      pay_status:    pay_method === 'Cash on Delivery' ? 'pending' : 'paid',
      stage:         0,
      status:        'Order Placed',
      route:         '',
      ...(delivery_address ? { delivery_address } : {}),
    })
    .select()
    .single();

  if (orderErr) {
    console.error('POST /orders insert error:', orderErr);
    return res.status(500).json({ error: 'Could not place order.' });
  }

  // ── 5. Insert order items (strip internal _fields) ────────────────────────
  const itemRows = resolvedItems.map(({ _lineTotal, _lineFarmerTotal, _handling, _exotic, _saved, ...rest }) => ({
    ...rest,
    order_id: order.id,
  }));

  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
  if (itemsErr) {
    console.error('POST /orders items insert error:', itemsErr);
    // Roll back the order. If the ROLLBACK itself fails we have an order row with
    // no items — an orphan that still counts in payouts and on every dashboard.
    // There is no second compensating action available, so at minimum it must be
    // loud: unread, this was a silent corruption.
    const { error: rollbackErr } = await supabase.from('orders').delete().eq('id', order.id);
    if (rollbackErr) {
      console.error(`ORPHANED ORDER ${code} (${order.id}) — items failed AND the rollback failed. ` +
                    `It has no order_items and must be removed by hand: ${rollbackErr.message}`);
    }
    return res.status(500).json({ error: 'Could not save order items.' });
  }

  // ── 6. Write first history entry ──────────────────────────────────────────
  // The order is already committed, so a failure here must NOT fail the request —
  // that would tell the customer their order failed when it did not. Log it; the
  // timeline is missing an entry, the order is fine.
  const { error: historyErr } = await supabase.from('order_history').insert({
    order_id: order.id,
    label:    'Order Placed',
    note:     `Order ${code} placed by ${order.consumer_name}.`,
  });
  if (historyErr) console.error(`Order ${code}: first history entry failed:`, historyErr.message);

  // ── 7. Reduce farmer listing quantities ──────────────────────────────────
  // Unread, BOTH queries below failed open into an oversell: a failed read left
  // `listing` null and the `if (listing)` guard skipped the decrement outright,
  // while a failed update simply did nothing — and either way the route still
  // answered "201 Order placed". Stock never dropped, the item was never
  // auto-unlisted at zero, and the next customer bought the same goods.
  //
  // The order is committed by this point and cannot be unwound, so a failure here
  // cannot fail the request. What it CAN do is stop being invisible.
  const stockFailures = [];

  for (const item of resolvedItems) {
    const { data: listing, error: readErr } = await supabase
      .from('farmer_listings')
      .select('qty_available')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .single();

    if (readErr || !listing) {
      stockFailures.push(`${item.product_id}/${item.farmer_id} (read: ${readErr ? readErr.message : 'no listing'})`);
      continue;
    }

    const newQty = Math.max(0, listing.qty_available - item.qty);
    const stockUpdate = { qty_available: newQty };
    // Auto-unlist when stock reaches zero so consumers can't order more
    if (newQty <= 0) stockUpdate.listed = false;

    const { error: writeErr } = await supabase
      .from('farmer_listings')
      .update(stockUpdate)
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id);

    if (writeErr) {
      stockFailures.push(`${item.product_id}/${item.farmer_id} (write: ${writeErr.message})`);
    }
  }

  if (stockFailures.length) {
    console.error(`OVERSELL RISK — order ${code} is placed but stock was NOT reduced for ` +
                  `${stockFailures.length} item(s); they remain on sale at the old quantity: ` +
                  stockFailures.join('; '));
  }

  res.status(201).json({ message: 'Order placed successfully.', order });
});

// ── GET /orders  (role-scoped) ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { village, district, route, status } = req.query;
  const u = req.user;

  /** Farmers only: { order_id → paise this farmer is owed }. Attached below. */
  let farmerPayouts = null;

  let query = supabase
    .from('orders')
    .select('id, code, consumer_name, district, village, delivery_village, total, status, stage, route, pay_method, pay_status, created_at, agent_name')
    .order('created_at', { ascending: false });

  if (u.role === 'consumer') {
    query = query.eq('consumer_id', u.id);

  } else if (u.role === 'farmer') {
    // Orders that contain this farmer's produce. The same query gives us what
    // she is owed on each one — the farmer earnings screen used to read
    // `o.farmer_payout`, a column that has never existed, so every figure
    // derived from it was silently zero.
    const { data: myItems, error: myItemsErr } = await supabase
      .from('order_items')
      .select('order_id, farmer_price, qty')
      .eq('farmer_id', u.id);

    // Unread, this failed into `{ orders: [] }` — indistinguishable from "you have
    // no orders". A seller would open the app, see an empty list, and have no
    // reason to think anything was wrong. Exactly the bug the comment above warns
    // about, one line below the warning.
    if (myItemsErr) {
      console.error('GET /orders farmer item lookup failed:', myItemsErr.message);
      return res.status(500).json({ error: 'Could not load your orders. Please try again.' });
    }

    const ids = [...new Set((myItems || []).map(r => r.order_id))];
    if (ids.length === 0) return res.json({ orders: [] });
    query = query.in('id', ids);
    farmerPayouts = payoutByOrder(myItems); // { order_id: paise }

  } else if (u.role === 'admin') {
    const role = u.admin_role;

    if (role === 'VCO') {
      // Match on the VCO's village. village_town is the canonical field (editable
      // in profile/admin edit); vco_city is a legacy fallback for older records.
      query = query.eq('village', u.village_town || u.vco_city);

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

  if (route)  query = query.eq('route',  route);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('GET /orders error:', error);
    return res.status(500).json({ error: 'Could not fetch orders.' });
  }

  // Computed, not stored: there is no orders.farmer_payout column. Paise here;
  // convertMoney turns it into rupees on the way out.
  const orders = farmerPayouts
    ? data.map(o => ({ ...o, farmer_payout: farmerPayouts[o.id] || 0 }))
    : data;

  res.json({ orders });
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

  // Consumer contact + address (for delivery display and for falling back when
  // the order didn't capture a delivery_address, e.g. pre-migration orders).
  if (order.consumer_id) {
    // A failed read here silently produced an order with NO delivery address and
    // no phone number — handed to a delivery agent who then has nowhere to take it.
    const { data: consumer, error: consumerErr } = await supabase
      .from('users')
      .select('phone, country_code, house_no, street1, street2, landmark, village_town, city, district, pincode, state')
      .eq('id', order.consumer_id)
      .maybeSingle();

    if (consumerErr) {
      console.error('GET /orders/:id consumer lookup failed:', consumerErr.message);
      return res.status(500).json({ error: 'Could not load the order. Please try again.' });
    }
    if (consumer) {
      order.consumer_phone = `${consumer.country_code || '+91'} ${consumer.phone}`;
      if (!order.delivery_address) {
        order.delivery_address = {
          label:        'Registered address',
          house_no:     consumer.house_no,
          street1:      consumer.street1,
          street2:      consumer.street2,
          landmark:     consumer.landmark,
          village_town: consumer.village_town,
          city:         consumer.city,
          district:     consumer.district,
          pincode:      consumer.pincode,
          state:        consumer.state,
          phone:        consumer.phone,
        };
      }
    }
  }

  // Fetch items. An order that renders with no items is not a detail page, it is a
  // lie — fail instead of drawing an empty basket for an order that has contents.
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', order.id);

  if (itemsErr) {
    console.error('GET /orders/:id items lookup failed:', itemsErr.message);
    return res.status(500).json({ error: 'Could not load the order. Please try again.' });
  }

  // Fetch status timeline
  const { data: history, error: historyErr } = await supabase
    .from('order_history')
    .select('label, note, ts')
    .eq('order_id', order.id)
    .order('ts', { ascending: true });

  if (historyErr) {
    console.error('GET /orders/:id history lookup failed:', historyErr.message);
    return res.status(500).json({ error: 'Could not load the order. Please try again.' });
  }

  // Existing return, if any. Derived from the returns table rather than stored
  // on the order: there is no orders.return_id column, and a denormalised copy
  // would be one more thing to keep in sync. Clients use this to hide the
  // "Request Return" button once a return has been raised.
  // limit(1), not maybeSingle: an order that somehow carries two returns would make
  // maybeSingle raise PGRST116, and unread that surfaced as "no return exists" —
  // re-showing the "Request Return" button on an order that already had one.
  const { data: returns, error: retErr } = await supabase
    .from('returns')
    .select('id, code, decision, collected')
    .eq('order_id', order.id)
    .limit(1);

  if (retErr) {
    console.error('GET /orders/:id return lookup failed:', retErr.message);
    return res.status(500).json({ error: 'Could not load the order. Please try again.' });
  }

  const ret = returns && returns.length ? returns[0] : null;

  order.return_id     = ret ? ret.id : null;
  order.return_code   = ret ? ret.code : null;
  order.return_status = ret ? (ret.decision || 'pending') : null;

  // QR token — signed with order code so the scan endpoint can trust it
  const qr_token = jwt.sign(
    { order_code: order.code },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Scannable QR (SVG) encoding the order code — agents scan it to advance the order.
  let qr_svg = null;
  try {
    qr_svg = await QRCode.toString(order.code, {
      type: 'svg', margin: 1, width: 168,
      color: { dark: '#0d1f16', light: '#ffffff' },
    });
  } catch (e) {
    console.error('QR generation failed:', e.message);
  }

  res.json({ order, items, history, qr_token, qr_svg });
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

  // History entry. The cancellation is already committed — a failed timeline row
  // must not report the cancellation as failed. Log it and move on.
  const { error: historyErr } = await supabase.from('order_history').insert({
    order_id: order.id,
    label:    'Cancelled',
    note:     cancel_reason || 'Cancelled by ' + (u.role === 'consumer' ? 'consumer' : `admin (${u.admin_role})`),
  });
  if (historyErr) console.error(`Order ${order.id}: cancellation history entry failed:`, historyErr.message);

  // ── Restore farmer listing quantities ─────────────────────────────────────
  // The mirror of the decrement on placement, and it failed the same silent way:
  // an unread error left `orderItems` null, `for (… of orderItems || [])` iterated
  // nothing, and the farmer never got their stock back. The order showed as
  // cancelled and the inventory was simply gone.
  const restoreFailures = [];

  const { data: orderItems, error: orderItemsErr } = await supabase
    .from('order_items')
    .select('farmer_id, product_id, qty')
    .eq('order_id', order.id);

  if (orderItemsErr) {
    restoreFailures.push(`could not read order items: ${orderItemsErr.message}`);
  }

  for (const item of orderItems || []) {
    const { data: listing, error: readErr } = await supabase
      .from('farmer_listings')
      .select('qty_available, listed')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .maybeSingle();

    if (readErr || !listing) {
      restoreFailures.push(`${item.product_id}/${item.farmer_id} (read: ${readErr ? readErr.message : 'no listing'})`);
      continue;
    }

    // Re-stock, and undo the auto-unlist — but ONLY that. Placement sets
    // `listed = false` when stock hits zero, and nothing ever set it back, so
    // cancelling an order that took a farmer's last unit returned the quantity and
    // left the listing hidden: stock on the books, invisible in the shop, until the
    // farmer noticed and toggled it by hand.
    //
    // Gated on qty_available === 0 because that is the ONLY state the auto-unlist
    // produces. A listing the farmer unlisted deliberately still has stock, and
    // re-listing it here would override a decision they made on purpose.
    const restock = { qty_available: listing.qty_available + item.qty };
    if (listing.qty_available === 0 && !listing.listed) restock.listed = true;

    const { error: writeErr } = await supabase
      .from('farmer_listings')
      .update(restock)
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id);

    if (writeErr) {
      restoreFailures.push(`${item.product_id}/${item.farmer_id} (write: ${writeErr.message})`);
    }
  }

  if (restoreFailures.length) {
    console.error(`STOCK NOT RESTORED — order ${order.id} is cancelled but ${restoreFailures.length} ` +
                  `listing(s) did not get their quantity back: ${restoreFailures.join('; ')}`);
  }

  res.json({
    message: 'Order cancelled.',
    order: updated,
    ...(refund_amt && { refund: { amount_paise: refund_amt, to: refund_to } }),
  });
});

module.exports = router;
