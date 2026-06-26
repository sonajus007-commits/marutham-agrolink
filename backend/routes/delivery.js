const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── Stage maps ────────────────────────────────────────────────────────────────
// Each route type has its own ordered list of statuses.
// stage (integer stored in DB) is the index into the list for that route.

const STAGE_MAP = {
  direct: [
    'Order Placed',     // 0
    'Packaged',         // 1
    'VCO Verified',     // 2
    'Picked Up',        // 3
    'Out for Delivery', // 4
    'Delivered',        // 5
  ],
  hub: [
    'Order Placed',     // 0
    'Packaged',         // 1
    'VCO Verified',     // 2
    'Picked Up',        // 3
    'In Transit',       // 4
    'At Hub',           // 5
    'Out for Delivery', // 6
    'Delivered',        // 7
  ],
};

// Before route is decided, use direct as the reference for stages 0-3
function resolveRoute(order) {
  return order.route || 'direct';
}

function statusForStage(route, stage) {
  const map = STAGE_MAP[route] || STAGE_MAP.direct;
  return map[stage] || null;
}

// ── Shared: advance an order one stage forward ────────────────────────────────
async function advanceStage(order, actorLabel, extraUpdates = {}) {
  const route = resolveRoute(order);
  const newStage = order.stage + 1;
  const newStatus = statusForStage(route, newStage);

  if (!newStatus) {
    return { error: 'Order is already at the final stage.' };
  }

  const now = new Date().toISOString();
  const updates = {
    stage: newStage,
    status: newStatus,
    updated_at: now,
    ...(newStatus === 'Delivered' ? { delivered_at: now } : {}),
    ...(newStatus === 'Picked Up'  ? { picked_up_at: now } : {}),
    // COD orders collect cash at doorstep — mark paid on delivery
    ...(newStatus === 'Delivered' && order.pay_method === 'Cash on Delivery' ? { pay_status: 'paid' } : {}),
    ...extraUpdates,
  };

  const { data: updated, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', order.id)
    .select()
    .single();

  if (error) return { error: 'Could not advance order stage.' };

  await supabase.from('order_history').insert({
    order_id: order.id,
    label: newStatus,
    note: `${newStatus} — by ${actorLabel}.`,
  });

  return { updated, newStatus };
}

// ── Helper: fetch order and guard against cancelled/delivered ─────────────────
async function fetchActiveOrder(id, res) {
  const isCode = id.startsWith('ORD');
  let q = supabase.from('orders').select('*');
  q = isCode ? q.eq('code', id) : q.eq('id', id);
  const { data: order, error } = await q.single();

  if (error || !order) { res.status(404).json({ error: 'Order not found.' }); return null; }
  if (order.cancelled)  { res.status(400).json({ error: 'Order is cancelled.' }); return null; }
  if (order.status === 'Delivered') { res.status(400).json({ error: 'Order is already delivered.' }); return null; }
  return order;
}

// ── POST /orders/:id/pack  (farmer only) ──────────────────────────────────────
router.post('/:id/pack', async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers can mark orders as packaged.' });
  }

  const order = await fetchActiveOrder(req.params.id, res);
  if (!order) return;

  if (order.stage !== 0) {
    return res.status(400).json({ error: `Cannot pack. Order is currently: "${order.status}".` });
  }

  // Confirm this farmer has items in the order
  const { data: items } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', order.id)
    .eq('farmer_id', req.user.id);

  if (!items || items.length === 0) {
    return res.status(403).json({ error: 'You have no items in this order.' });
  }

  const { updated, error } = await advanceStage(
    order,
    `Farmer ${req.user.fname}`
  );
  if (error) return res.status(500).json({ error });

  res.json({ ok: true, message: 'Order marked as Packaged.', newStatus: updated.status, order: updated });
});

// ── POST /orders/:id/scan  ⭐ role-scoped scan ────────────────────────────────
// Body: { order_code } (from QR scan or manual entry)
router.post('/:id/scan', async (req, res) => {
  const u = req.user;

  if (u.role === 'consumer' || u.role === 'farmer') {
    return res.status(403).json({ error: 'Consumers and farmers cannot perform scans.' });
  }

  const order = await fetchActiveOrder(req.params.id, res);
  if (!order) return;

  const adminRole = u.admin_role;
  const { stage } = order;
  let result;

  // VCO scans a Packaged order → VCO Verified
  if ((adminRole === 'VCO' || u.role === 'admin') && stage === 1) {
    if (adminRole !== 'VCO' && adminRole !== 'Head Office' && adminRole !== 'State Head' && adminRole !== 'Regional Manager' && adminRole !== 'District Manager') {
      // Delivery Agents should not do VCO verify
      return res.status(403).json({ error: 'Only VCO or senior admins can verify packaged orders.' });
    }
    result = await advanceStage(order, `VCO ${req.user.fname}`);

  // Delivery Agent (or admin) scans VCO Verified → Picked Up + assign agent + auto-route
  } else if (stage === 2) {
    const autoRoute = 'direct'; // default; can be overridden via PATCH /route
    result = await advanceStage(order, `Agent ${req.user.fname}`, {
      agent_id:     u.id,
      agent_name:   `${u.fname}${u.lname ? ' ' + u.lname : ''}`,
      agent_phone:  u.phone,
      agent_vehicle: u.agent_vehicle || null,
      route:        autoRoute,
      route_auto:   autoRoute,
    });

  // Delivery Agent (or admin) advances an in-progress order
  } else if (stage >= 3) {
    result = await advanceStage(order, `Agent ${req.user.fname}`);

  } else {
    return res.status(400).json({
      error: `Cannot scan. Order is at stage "${order.status}". It must be Packaged or later.`,
    });
  }

  if (result.error) return res.status(500).json({ error: result.error });

  res.json({ ok: true, message: `Order advanced to: ${result.newStatus}.`, newStatus: result.newStatus });
});

// ── PATCH /orders/:id/route  (Delivery Agent or Admin) ───────────────────────
router.patch('/:id/route', async (req, res) => {
  const u = req.user;
  const isAgent = u.role === 'admin' && u.admin_role === 'Delivery Agent';
  const isSeniorAdmin = u.role === 'admin' && ['Head Office','State Head','Regional Manager','District Manager','Hub Incharge'].includes(u.admin_role);

  if (!isAgent && !isSeniorAdmin) {
    return res.status(403).json({ error: 'Only Delivery Agents or admins can override the route.' });
  }

  const { route } = req.body;
  if (!['hub', 'direct'].includes(route)) {
    return res.status(400).json({ error: 'route must be "hub" or "direct".' });
  }

  const order = await fetchActiveOrder(req.params.id, res);
  if (!order) return;

  // Route can only be changed before Out for Delivery
  const currentStatus = order.status;
  if (['Out for Delivery', 'Delivered'].includes(currentStatus)) {
    return res.status(400).json({ error: 'Route cannot be changed once the order is out for delivery.' });
  }

  // Recalculate ETA: direct = +2h, hub = +4h from now
  const etaHours = route === 'hub' ? 4 : 2;
  const eta_ts = new Date(Date.now() + etaHours * 60 * 60 * 1000).toISOString();

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ route, eta_ts, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Could not update route.' });

  await supabase.from('order_history').insert({
    order_id: order.id,
    label: 'Route Updated',
    note: `Route changed to "${route}" by ${req.user.fname}. ETA recalculated to +${etaHours}h.`,
  });

  res.json({ ok: true, message: `Route set to "${route}". ETA updated.`, order: updated });
});

// ── POST /orders/:id/advance  (Admin only — manual override) ──────────────────
router.post('/:id/advance', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can manually advance orders.' });
  }

  const order = await fetchActiveOrder(req.params.id, res);
  if (!order) return;

  const { updated, error } = await advanceStage(
    order,
    `Admin ${req.user.fname} (${req.user.admin_role}) — manual override`
  );
  if (error) return res.status(400).json({ error });

  res.json({ ok: true, message: `Order advanced to: ${updated.status}.`, newStatus: updated.status, order: updated });
});

// ── POST /orders/:id/assign  (Admin only — assign / reassign delivery agent) ──
router.post('/:id/assign', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can assign agents.' });
  }

  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id is required.' });

  const { data: agent, error: ae } = await supabase
    .from('users')
    .select('id, fname, lname, phone, agent_vehicle, role, admin_role')
    .eq('id', agent_id)
    .single();

  if (ae || !agent) return res.status(404).json({ error: 'Agent not found.' });
  if (agent.role !== 'admin' || agent.admin_role !== 'Delivery Agent') {
    return res.status(400).json({ error: 'Selected user is not a Delivery Agent.' });
  }

  const agentName = agent.fname + (agent.lname ? ' ' + agent.lname : '');
  const { data: updated, error: ue } = await supabase
    .from('orders')
    .update({
      agent_id,
      agent_name:    agentName,
      agent_phone:   agent.phone,
      agent_vehicle: agent.agent_vehicle || '',
      updated_at:    new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (ue) return res.status(500).json({ error: ue.message });

  // Log assignment in order history
  await supabase.from('order_history').insert({
    order_id: req.params.id,
    label:    'Agent Assigned',
    note:     `${agentName} assigned by ${req.user.fname} (${req.user.admin_role})`,
    ts:       new Date().toISOString(),
  });

  res.json({ message: `Agent ${agentName} assigned.`, order: updated });
});

// ── GET /orders/:id/track  (consumer who owns it, or any staff) ───────────────
router.get('/:id/track', async (req, res) => {
  const u = req.user;
  const isCode = req.params.id.startsWith('ORD');
  let q = supabase.from('orders').select('*');
  q = isCode ? q.eq('code', req.params.id) : q.eq('id', req.params.id);
  const { data: order, error } = await q.single();

  if (error || !order) return res.status(404).json({ error: 'Order not found.' });

  if (u.role === 'consumer' && order.consumer_id !== u.id) {
    return res.status(403).json({ error: 'You can only track your own orders.' });
  }

  const { data: history } = await supabase
    .from('order_history')
    .select('label, note, ts')
    .eq('order_id', order.id)
    .order('ts', { ascending: true });

  const route  = resolveRoute(order);
  const stages = STAGE_MAP[route];

  // Build the route map — each node shows whether it's done, active, or pending
  const routeMap = stages.map((label, i) => ({
    step:   i,
    label,
    status: i < order.stage ? 'done' : i === order.stage ? 'active' : 'pending',
  }));

  res.json({
    order: {
      id:       order.id,
      code:     order.code,
      status:   order.status,
      stage:    order.stage,
      route,
      cancelled: order.cancelled,
    },
    agent: order.agent_name ? {
      name:    order.agent_name,
      phone:   order.agent_phone,
      vehicle: order.agent_vehicle,
    } : null,
    eta:      order.eta_ts,
    routeMap,
    timeline: history,
  });
});

module.exports = router;
