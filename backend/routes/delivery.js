const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { distanceMeters } = require('../utils/geo');
const { SPLIT_ROUTE } = require('../utils/orderSplit');
const { rollupToParent } = require('../utils/orderRollup');

const router = express.Router();
router.use(requireAuth);

// A delivery whose captured location is more than this far from the consumer's
// pinned address is flagged in the order timeline. Generous on purpose — GPS drift
// and a pin dropped at the gate of a large plot are normal; this catches the
// "delivered in the wrong village" case, not the wrong doorstep.
const GEOFENCE_RADIUS_M = 500;

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
  // The hub lane collects the parcel to the hub FIRST and only names a last-mile
  // agent once it has arrived, so 'Picked Up' sits AFTER 'At Hub' here — it is the
  // delivery agent taking custody at the hub, not the collection from the village.
  // That is why stage integers are not comparable across routes (see PATCH /route).
  hub: [
    'Order Placed',     // 0
    'Packaged',         // 1
    'VCO Verified',     // 2
    'In Transit',       // 3
    'At Hub',           // 4
    'Picked Up',        // 5
    'Out for Delivery', // 6
    'Delivered',        // 7
  ],
  /* The container of a multi-vendor order. It is not a parcel and nothing advances
   * it — its stage is a ROLLUP of its children (the least advanced one), which may
   * be a hub-only status even when some parts are going direct. So its map is the
   * superset, the only one that can hold every status a child might report.
   *
   * It is not selectable: PATCH /route whitelists 'hub' and 'direct' before it ever
   * reaches this map. It exists so that reading a parent — GET /:id/track builds its
   * routeMap straight from STAGE_MAP[route] — finds a list instead of undefined.
   * Without it that read threw inside an async handler, and Express 4 does not catch
   * async throws: the request never answered and the customer's order sheet spun
   * for ever. */
  split: [
    'Order Placed',     // 0
    'Packaged',         // 1
    'VCO Verified',     // 2
    'In Transit',       // 3
    'At Hub',           // 4
    'Picked Up',        // 5
    'Out for Delivery', // 6
    'Delivered',        // 7
  ],
};

/* The parent of a multi-vendor order is a container, not a parcel: its goods are in
 * several villages and travel as separate child orders. Nothing in this file may act
 * on one — there is no single thing to verify, pick up, or hand over. The parent's
 * status is derived from its children instead (utils/orderRollup). */
const isSplitParent = (order) => order.route === SPLIT_ROUTE;
const SPLIT_PARENT_MESSAGE =
  'This order is split across several sellers. Scan the individual parcel code ' +
  '(the one ending in -1, -2, …) — the whole order is not handled as one item.';

// Who may do what. A Delivery Agent and a VCO are NOT hub staff.
const SENIOR_ADMIN_ROLES = ['Head Office', 'State Head', 'Regional Manager', 'District Manager'];
const isSeniorAdmin = (r) => SENIOR_ADMIN_ROLES.includes(r);
const isHubStaff = (r) => r === 'Hub Incharge' || isSeniorAdmin(r);

// Before route is decided, use direct as the reference for stages 0-3
function resolveRoute(order) {
  return order.route || 'direct';
}

function statusForStage(route, stage) {
  const map = STAGE_MAP[route] || STAGE_MAP.direct;
  return map[stage] || null;
}

// ── Shared: advance an order one stage forward ────────────────────────────────
// `deliveryCoords` ({ lat, lng } or null) is proof-of-delivery location; it is only
// written when THIS transition is the one to Delivered, alongside delivered_at.
async function advanceStage(order, actorLabel, extraUpdates = {}, deliveryCoords = null) {
  const route = resolveRoute(order);
  const newStage = order.stage + 1;
  const newStatus = statusForStage(route, newStage);

  if (!newStatus) {
    return { error: 'Order is already at the final stage.' };
  }

  const now = new Date().toISOString();
  const delivering = newStatus === 'Delivered';

  // Geofence: distance (m) from the agent's captured fix to the consumer's pinned
  // delivery address. Only on delivery, and only when BOTH points exist — a delivery
  // with no fix, or an order whose address was never pinned, is not comparable (null).
  let deliveryDistance = null;
  if (delivering && deliveryCoords) {
    const pin = order.delivery_address;
    if (pin && typeof pin === 'object') {
      deliveryDistance = distanceMeters(deliveryCoords.lat, deliveryCoords.lng, pin.lat, pin.lng);
    }
  }

  const updates = {
    stage: newStage,
    status: newStatus,
    updated_at: now,
    ...(delivering ? { delivered_at: now } : {}),
    ...(delivering && deliveryCoords
      ? { delivered_lat: deliveryCoords.lat, delivered_lng: deliveryCoords.lng }
      : {}),
    ...(deliveryDistance !== null ? { delivery_distance_m: Math.round(deliveryDistance) } : {}),
    ...(newStatus === 'Picked Up'  ? { picked_up_at: now } : {}),
    // COD orders collect cash at doorstep — mark paid on delivery
    ...(delivering && order.pay_method === 'Cash on Delivery' ? { pay_status: 'paid' } : {}),
    ...extraUpdates,
  };

  // Compare-and-swap on the stage we read. Advancing is a read-modify-write, so
  // filtering only on id lets two writers each read stage N and each advance it —
  // two steps for one real event. Pinning the update to the stage this request
  // observed means the loser matches no row and is told, instead of double-advancing.
  // maybeSingle, not single: no match is the CONFLICT answer here, not an error.
  const { data: updated, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', order.id)
    .eq('stage', order.stage)
    .select()
    .maybeSingle();

  if (error) return { error: 'Could not advance order stage.' };
  if (!updated) return { conflict: true };

  // The stage change above is committed. A failed timeline row must not report it
  // as a failure — but it must not vanish either.
  const { error: histErr } = await supabase.from('order_history').insert({
    order_id: order.id,
    label: newStatus,
    note: `${newStatus} — by ${actorLabel}.`,
  });
  if (histErr) console.error(`Order ${order.id}: '${newStatus}' history entry failed:`, histErr.message);

  // Geofence breach: surface an off-site delivery in the timeline so it is visible
  // without anyone querying the distance column. Advisory — the delivery still stands.
  if (deliveryDistance !== null && deliveryDistance > GEOFENCE_RADIUS_M) {
    const meters = Math.round(deliveryDistance);
    const { error: geoErr } = await supabase.from('order_history').insert({
      order_id: order.id,
      label: 'Off-site delivery',
      note: `Delivered ~${meters} m from the pinned address (geofence ${GEOFENCE_RADIUS_M} m).`,
    });
    if (geoErr) console.error(`Order ${order.id}: geofence note failed:`, geoErr.message);
  }

  /* If this was one parcel of a multi-vendor order, the customer's view of that
   * order just changed: its headline status is the least-advanced parcel, and a COD
   * order is only paid once every parcel has been handed over. A no-op for an
   * ordinary order, which has no parent.
   *
   * Deliberately not part of the compare-and-swap above and deliberately not fatal:
   * the parcel HAS moved and the agent must be told so. A parent left briefly stale
   * is repaired by the next child event; a scan rejected because a summary row
   * failed to update is a delivery stopped for no reason. */
  await rollupToParent(order.parent_order_id);

  return { updated, newStatus };
}

// The order moved between advanceStage's read and its write — another scanner got
// there first. Refuse rather than guess: the caller was acting on a stage that no
// longer exists. 409 so a queued replay drops instead of retrying (classifyReplay).
function conflictResponse(res) {
  return res.status(409).json({
    error: 'This order was just updated by someone else. Reload and try again.',
  });
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
  if (isSplitParent(order)) { res.status(400).json({ error: SPLIT_PARENT_MESSAGE }); return null; }
  return order;
}

// Optional "where the scanner is" coordinates on a scan body. One generic lat/lng
// serves every handoff — the stage decides which column it lands in (verified_* at
// VCO, delivered_* at delivery, dispatched_* at the hub). Absent → { coords: null }
// (location was declined; the scan proceeds). Malformed → an { error } the caller
// turns into a 400, so a bad pair never lands in a row.
function parseScanCoords(body) {
  const { lat: rawLat, lng: rawLng } = body || {};
  if (rawLat == null && rawLng == null) return { coords: null };
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'Invalid location.' };
  }
  return { coords: { lat, lng } };
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
  // Unread, a failed read left `items` null and the farmer was told they have no
  // items in an order that is theirs — locked out of advancing their own order,
  // and told it was a permissions problem.
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('id')
    .eq('order_id', order.id)
    .eq('farmer_id', req.user.id);

  if (itemsErr) {
    console.error('Farmer item check failed:', itemsErr.message);
    return res.status(500).json({ error: 'Could not verify your items in this order. Please try again.' });
  }
  if (!items || items.length === 0) {
    return res.status(403).json({ error: 'You have no items in this order.' });
  }

  const { updated, error, conflict } = await advanceStage(
    order,
    `Farmer ${req.user.fname}`
  );
  if (conflict) return conflictResponse(res);
  if (error) return res.status(500).json({ error });

  res.json({ ok: true, message: 'Order marked as Packaged.', newStatus: updated.status, order: updated });
});

// ── POST /orders/:id/confirm-received  (Consumer — confirm receipt → Delivered) ─
// The one status action a CONSUMER owns. An order that is Out for Delivery has
// reached them; confirming receipt completes it (→ Delivered) and unlocks rating —
// the parallel to the agent's delivery scan, minus the proof-of-delivery GPS (the
// customer is not the courier, so no geofence is computed). A COD order is still
// marked paid, exactly as an agent delivery would: receiving the parcel is the
// payment event.
router.post('/:id/confirm-received', async (req, res) => {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only the customer can confirm receipt.' });
  }

  const order = await fetchActiveOrder(req.params.id, res);
  if (!order) return;

  if (order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only confirm your own orders.' });
  }
  // Only from Out for Delivery: a customer cannot confirm a parcel that has not yet
  // left for them, and advanceStage from this stage lands on Delivered on both the
  // direct (4→5) and hub (6→7) maps.
  if (order.status !== 'Out for Delivery') {
    return res.status(400).json({ error: `Cannot confirm receipt yet — the order is "${order.status}".` });
  }

  const { updated, error, conflict } = await advanceStage(order, `Customer ${req.user.fname}`);
  if (conflict) return conflictResponse(res);
  if (error) return res.status(500).json({ error });

  res.json({ ok: true, message: 'Delivery confirmed. Thank you!', newStatus: updated.status, order: updated });
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

  // A scan says "advance one stage from where this order is NOW" — the body never
  // states which transition was intended. That is safe while the tap and the write
  // are the same instant, and unsafe the moment they are not: a write parked offline
  // and replayed one stage later performs a DIFFERENT transition. A hub dispatch
  // (stage 5) replayed at stage 6 falls through to the `stage >= 3` branch and marks
  // the order Delivered — collecting COD cash nobody collected.
  //
  // So a caller that may be delayed sends the stage it was looking at. If the order
  // has moved, we refuse rather than act. 409 is deliberate: the offline queue drops
  // a 4xx (see packages/lib offlineQueue classifyReplay) instead of retrying it, so a
  // superseded write dies quietly here rather than corrupting the order.
  const { from_stage: fromStage } = req.body || {};
  if (fromStage !== undefined && fromStage !== null) {
    if (!Number.isInteger(fromStage)) {
      return res.status(400).json({ error: 'from_stage must be an integer.' });
    }
    if (fromStage !== order.stage) {
      return res.status(409).json({
        error: `This order has already moved on — it is now "${order.status}". Nothing was changed.`,
        currentStage: order.stage,
        currentStatus: order.status,
      });
    }
  }

  // Where the scanner is, if the device shared it. Each branch below stamps it onto
  // the column for the stage it completes (VCO verify, hub dispatch, delivery).
  const coords = parseScanCoords(req.body);
  if (coords.error) return res.status(400).json({ error: coords.error });

  const adminRole = u.admin_role;
  const isAgent = adminRole === 'Delivery Agent';
  // Branches key off the STATUS, not the stage index. The two routes no longer
  // agree on what a given stage number means ('Picked Up' is 3 on direct and 5 on
  // hub), so a stage-number branch would fire on the wrong transition.
  const status = order.status;
  let result;

  // VCO scans a Packaged order → VCO Verified.
  // At verification the VCO chooses the route (direct / hub). On a DIRECT order they
  // also name the delivery agent — auto-matched against the consumer's delivery
  // village. A hub order gets its agent later, from the Hub Incharge, because until
  // the parcel reaches the hub nobody knows who will run the last mile.
  if (status === 'Packaged') {
    if (adminRole !== 'VCO' && !isSeniorAdmin(adminRole)) {
      // Delivery Agents should not do VCO verify
      return res.status(403).json({ error: 'Only VCO or senior admins can verify packaged orders.' });
    }

    const { agent_id, route } = req.body;
    const extra = {};

    // Where the VCO verified/collected the order. This branch only ever produces
    // 'VCO Verified', so it is stored unconditionally (no gating needed).
    if (coords.coords) {
      extra.verified_lat = coords.coords.lat;
      extra.verified_lng = coords.coords.lng;
    }

    if (route !== undefined) {
      if (route !== 'direct' && route !== 'hub') {
        return res.status(400).json({ error: "route must be 'direct' or 'hub'." });
      }
      extra.route = route;
      extra.route_auto = route;
    }

    let assignedName = null;
    if (agent_id) {
      // maybeSingle + a read error check: unread, a database fault made `agent` null
      // and the caller was told the person they picked "is not a Delivery Agent" —
      // a wrong answer about someone who is one.
      const { data: agent, error: agentErr } = await supabase
        .from('users')
        .select('id, fname, lname, phone, agent_vehicle, role, admin_role')
        .eq('id', agent_id)
        .is('deleted_at', null)          // a removed agent cannot take a delivery
        .maybeSingle();
      if (agentErr) {
        console.error('Delivery agent lookup failed:', agentErr.message);
        return res.status(500).json({ error: 'Could not look up that agent. Please try again.' });
      }
      if (!agent || agent.role !== 'admin' || agent.admin_role !== 'Delivery Agent') {
        return res.status(400).json({ error: 'Selected user is not a Delivery Agent.' });
      }
      assignedName = agent.fname + (agent.lname ? ' ' + agent.lname : '');
      extra.agent_id      = agent.id;
      extra.agent_name    = assignedName;
      extra.agent_phone   = agent.phone;
      extra.agent_vehicle = agent.agent_vehicle || null;
    }

    result = await advanceStage(order, `VCO ${req.user.fname}`, extra);

    if (!result.error && assignedName) {
      const { error: histErr } = await supabase.from('order_history').insert({
        order_id: order.id,
        label:    'Agent Assigned',
        note:     `${assignedName} assigned by VCO ${req.user.fname}.`,
      });
      if (histErr) console.error(`Order ${order.id}: agent-assigned history entry failed:`, histErr.message);
    }

  // A verified order leaves the village. Where it goes next is the VCO's route
  // choice: DIRECT hands it to the assigned agent (→ Picked Up), HUB starts the
  // line-haul to the hub (→ In Transit). Either way the stage map does the work —
  // both land on index 3, they just spell it differently.
  } else if (status === 'VCO Verified') {
    const keepRoute = order.route || 'direct';
    // A hub-bound parcel is a bulk movement; no individual agent takes custody of it
    // until the hub assigns one, so it must not inherit the scanner as its agent.
    const claimAgent = keepRoute === 'hub' ? {} : {
      agent_id:      order.agent_id    || u.id,
      agent_name:    order.agent_name  || `${u.fname}${u.lname ? ' ' + u.lname : ''}`,
      agent_phone:   order.agent_phone || u.phone,
      agent_vehicle: order.agent_vehicle || u.agent_vehicle || null,
    };
    result = await advanceStage(order, `Agent ${req.user.fname}`, {
      ...claimAgent,
      route:      keepRoute,
      route_auto: order.route_auto || keepRoute,
    });

  // Hub check-in: In Transit → At Hub. The Hub Incharge ACCEPTING the parcel into
  // the hub is a custody event, so it is theirs alone — a delivery agent must not be
  // able to book a parcel into a hub they are not standing in.
  } else if (status === 'In Transit') {
    if (!isHubStaff(adminRole)) {
      return res.status(403).json({ error: 'Only the Hub Incharge or senior admins can receive orders at the hub.' });
    }
    result = await advanceStage(order, `Hub ${req.user.fname}`);

  // Last-mile pickup: At Hub → Picked Up. The Hub Incharge has already named the
  // agent via POST /assign (which does not move the status); this is that agent
  // taking physical custody. An unassigned parcel is claimed by whoever scans it,
  // matching the direct lane's behaviour.
  } else if (status === 'At Hub') {
    if (!isAgent && !isHubStaff(adminRole)) {
      return res.status(403).json({ error: 'Only the assigned Delivery Agent or hub staff can pick up from the hub.' });
    }
    // Guard the assignment: once a hub names an agent, another agent walking past
    // must not be able to take the parcel off them.
    if (isAgent && order.agent_id && order.agent_id !== u.id) {
      return res.status(403).json({ error: 'This order is assigned to another Delivery Agent.' });
    }

    const extra = {
      agent_id:      order.agent_id    || u.id,
      agent_name:    order.agent_name  || `${u.fname}${u.lname ? ' ' + u.lname : ''}`,
      agent_phone:   order.agent_phone || u.phone,
      agent_vehicle: order.agent_vehicle || u.agent_vehicle || null,
    };
    // Where the parcel left the hub. This branch only ever produces 'Picked Up',
    // so it is stored unconditionally (like the VCO verify branch).
    if (coords.coords) {
      extra.dispatched_lat = coords.coords.lat;
      extra.dispatched_lng = coords.coords.lng;
    }
    result = await advanceStage(order, `Agent ${req.user.fname}`, extra);

  // The agent confirms the round has started: Picked Up → Out for Delivery.
  } else if (status === 'Picked Up') {
    result = await advanceStage(order, `Agent ${req.user.fname}`);

  // Out for Delivery → Delivered. The only branch that reaches Delivered, so the
  // proof-of-delivery coordinates ride along here.
  } else if (status === 'Out for Delivery') {
    result = await advanceStage(order, `Agent ${req.user.fname}`, {}, coords.coords);

  } else {
    return res.status(400).json({
      error: `Cannot scan. Order is at stage "${order.status}". It must be Packaged or later.`,
    });
  }

  if (result.conflict) return conflictResponse(res);
  if (result.error) return res.status(500).json({ error: result.error });

  res.json({ ok: true, message: `Order advanced to: ${result.newStatus}.`, newStatus: result.newStatus });
});

// ── PATCH /orders/:id/route  (Delivery Agent or Admin) ───────────────────────
router.patch('/:id/route', async (req, res) => {
  const u = req.user;
  const isAgent = u.role === 'admin' && u.admin_role === 'Delivery Agent';
  // Rerouting hub↔direct is a Delivery Assignment edit — Admin + Hub Incharge.
  const canReroute = can(u, 'delivery_assignment', 'edit');

  if (!isAgent && !canReroute) {
    return res.status(403).json({ error: 'Only the assigned agent, Hub Incharge or Admin can override the route.' });
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

  // `stage` is an INDEX INTO THE ROUTE'S OWN MAP, and the two maps disagree about
  // what a given index means ('Picked Up' is 3 on direct, 5 on hub). Writing `route`
  // alone would therefore leave the stage pointing at a different status than the one
  // the order is actually in — silently relabelling it without anything moving. So
  // re-derive the stage from the CURRENT STATUS in the target map, and refuse when
  // that status has no counterpart there (an At Hub order cannot become direct).
  const targetMap = STAGE_MAP[route];
  const remappedStage = targetMap.indexOf(currentStatus);
  if (remappedStage === -1) {
    return res.status(400).json({
      error: `An order at "${currentStatus}" cannot be switched to the ${route} route.`,
    });
  }

  // Recalculate ETA: direct = +2h, hub = +4h from now
  const etaHours = route === 'hub' ? 4 : 2;
  const eta_ts = new Date(Date.now() + etaHours * 60 * 60 * 1000).toISOString();

  const { data: updated, error } = await supabase
    .from('orders')
    .update({ route, stage: remappedStage, eta_ts, updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'Could not update route.' });

  const { error: histErr } = await supabase.from('order_history').insert({
    order_id: order.id,
    label: 'Route Updated',
    note: `Route changed to "${route}" by ${req.user.fname}. ETA recalculated to +${etaHours}h.`,
  });
  if (histErr) console.error(`Order ${order.id}: route-update history entry failed:`, histErr.message);

  res.json({ ok: true, message: `Route set to "${route}". ETA updated.`, order: updated });
});

// ── POST /orders/:id/advance  (Admin only — manual override) ──────────────────
router.post('/:id/advance', async (req, res) => {
  if (!can(req.user, 'delivery_tracking', 'edit')) {
    return res.status(403).json({ error: 'Delivery tracking edit permission required to manually advance an order.' });
  }

  const order = await fetchActiveOrder(req.params.id, res);
  if (!order) return;

  const { updated, error, conflict } = await advanceStage(
    order,
    `Admin ${req.user.fname} (${req.user.admin_role}) — manual override`
  );
  if (conflict) return conflictResponse(res);
  if (error) return res.status(400).json({ error });

  res.json({ ok: true, message: `Order advanced to: ${updated.status}.`, newStatus: updated.status, order: updated });
});

// ── POST /orders/:id/status  (Senior admin — set order to ANY status) ─────────
// Unlike /advance (one step forward), this SETS the order to any status in its
// route's stage map — forward, backward, or a jump. A last-resort correction tool
// for when the physical flow and the record diverge. Restricted to senior admins,
// audited in the timeline, and it touches the delivery/pickup stamps to match the
// target so the record stays internally consistent.
router.post('/:id/status', async (req, res) => {
  // Setting an order to ANY status is a senior dispatch correction — the Delivery
  // Assignment 'assign' authority (Admin + Hub Incharge). Deliberately stronger than
  // /advance: a Delivery Agent may step their own order forward, but not jump it to
  // an arbitrary status.
  if (!can(req.user, 'delivery_assignment', 'assign')) {
    return res.status(403).json({ error: 'Delivery assignment permission required to manually set an order status.' });
  }

  const target = req.body?.status;
  if (!target || typeof target !== 'string') {
    return res.status(400).json({ error: 'A target status is required.' });
  }

  // maybeSingle, not fetchActiveOrder: this tool must reach a Delivered order too
  // (the point is to correct/reverse one). A cancelled order stays off-limits —
  // cancellation is a separate, terminal lifecycle, not a stage on this map.
  const { data: order, error: fErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fErr) return res.status(500).json({ error: 'Could not load order.' });
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.cancelled) return res.status(400).json({ error: 'Order is cancelled.' });
  // A container has no status of its own to set — it reports what its parcels are
  // doing. Setting one here would be overwritten by the next rollup anyway.
  if (isSplitParent(order)) {
    return res.status(400).json({
      error: 'This order is split across several sellers. Set the status on the individual part instead — ' +
             'the overall order follows its parts.',
    });
  }

  const route = resolveRoute(order);
  const map = STAGE_MAP[route] || STAGE_MAP.direct;
  const newStage = map.indexOf(target);
  if (newStage === -1) {
    return res
      .status(400)
      .json({ error: `"${target}" is not a valid status for this order's ${route} route.` });
  }
  if (newStage === order.stage) {
    return res.status(400).json({ error: `Order is already "${target}".` });
  }

  const now = new Date().toISOString();
  const delivering = target === 'Delivered';
  const wasDelivered = order.status === 'Delivered';

  const updates = {
    stage: newStage,
    status: target,
    updated_at: now,
    // Landing ON delivered stamps the time; a COD order banks its cash, mirroring
    // a real delivery scan. Money is only ever set forward here, never auto-reversed
    // (see below) — reversing a payment is a finance action, not a status fix.
    ...(delivering ? { delivered_at: now } : {}),
    ...(delivering && order.pay_method === 'Cash on Delivery' ? { pay_status: 'paid' } : {}),
    ...(target === 'Picked Up' ? { picked_up_at: now } : {}),
    // Reversing OUT of delivered must not leave a stale delivery stamp/geo behind.
    ...(wasDelivered && !delivering
      ? { delivered_at: null, delivered_lat: null, delivered_lng: null, delivery_distance_m: null }
      : {}),
  };

  const { data: updated, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', order.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const actor = `${req.user.fname} (${req.user.admin_role})`;
  const { error: histErr } = await supabase.from('order_history').insert({
    order_id: order.id,
    label: target,
    note: `Status set to "${target}" (from "${order.status}") by ${actor} — manual override.`,
  });
  if (histErr) console.error(`Order ${order.id}: manual status history entry failed:`, histErr.message);

  // An override on one parcel changes what the customer's order reads overall —
  // including backwards, which is the point of this tool.
  await rollupToParent(order.parent_order_id);

  res.json({ ok: true, message: `Order set to: ${target}.`, newStatus: target, order: updated });
});

// ── POST /orders/:id/assign  (Admin only — assign / reassign delivery agent) ──
router.post('/:id/assign', async (req, res) => {
  if (!can(req.user, 'delivery_assignment', 'assign')) {
    return res.status(403).json({ error: 'Delivery assignment permission required to assign agents.' });
  }

  const { agent_id } = req.body;
  if (!agent_id) return res.status(400).json({ error: 'agent_id is required.' });

  const { data: agent, error: ae } = await supabase
    .from('users')
    .select('id, fname, lname, phone, agent_vehicle, role, admin_role')
    .eq('id', agent_id)
    .is('deleted_at', null)          // a removed agent cannot take a delivery
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
    // No agent carries a container. Each parcel of a split order gets its own
    // agent — often a different one, since they start in different villages.
    // Filtering here rather than fetching first keeps it one round trip; a parent
    // matches nothing and falls into the 404 below.
    .neq('route', SPLIT_ROUTE)
    .select()
    .maybeSingle();

  if (ue) return res.status(500).json({ error: ue.message });
  if (!updated) {
    return res.status(404).json({
      error: 'Order not found, or it is a multi-seller order — assign an agent to each part instead.',
    });
  }

  // Log assignment in order history
  const { error: histErr } = await supabase.from('order_history').insert({
    order_id: req.params.id,
    label:    'Agent Assigned',
    note:     `${agentName} assigned by ${req.user.fname} (${req.user.admin_role})`,
    ts:       new Date().toISOString(),
  });
  if (histErr) console.error(`Order ${req.params.id}: agent-assigned history entry failed:`, histErr.message);

  res.json({ message: `Agent ${agentName} assigned.`, order: updated });
});

// ── GET /orders/:id/eligible-agents  (VCO/admin — agents to assign) ───────────
// Returns Delivery Agents whose service villages cover the relevant village.
// `leg=collection` (default) matches the order's fulfilment village (farmer side);
// `leg=delivery` matches the consumer's delivery village (hub → doorstep).
router.get('/:id/eligible-agents', async (req, res) => {
  // Both roles that name an agent may list them: a VCO at verify time (via /scan —
  // a role check; VCOs hold delivery_assignment view/create, not 'assign'), and a
  // Hub Incharge / senior admin via /assign (the RBAC 'assign' permission). Guarding
  // on 'assign' alone 403'd the VCO verify picker — which is why this allows VCO too.
  if (req.user.admin_role !== 'VCO' && !can(req.user, 'delivery_assignment', 'assign')) {
    return res.status(403).json({ error: 'Delivery assignment permission required.' });
  }

  const { data: order, error: oe } = await supabase
    .from('orders')
    .select('id, village, delivery_village, district, delivery_address, delivered_lat, delivered_lng')
    .eq('id', req.params.id)
    .single();
  if (oe || !order) return res.status(404).json({ error: 'Order not found.' });

  // collection leg → farmer-side fulfilment village (VCO assigns pickup agent).
  // delivery leg → consumer-side delivery village (Hub Incharge assigns last-mile
  // agent); falls back to the fulfilment village if none was captured.
  const leg = req.query.leg === 'delivery' ? 'delivery' : 'collection';
  const da = order.delivery_address || {};
  const village =
    leg === 'delivery'
      ? order.delivery_village || order.village || da.village_town || null
      : order.village || null;
  const taluk = (da.taluk || '').trim() || null;

  // All Delivery Agents in the order's district — the manual-fallback list.
  const { data: all, error: ae } = await supabase
    .from('users')
    .select(
      'id, fname, lname, phone, agent_vehicle, village_town, service_villages, ' +
        'service_areas, hub_id, taluk, available_date, agent_lat, agent_lng, district',
    )
    .eq('role', 'admin')
    .eq('admin_role', 'Delivery Agent')
    .is('deleted_at', null)          // removed agents are not offered for assignment
    .eq('district', order.district)
    .eq('status', 'active');
  if (ae) return res.status(500).json({ error: ae.message });

  // ready-today ⇔ available_date === today (IST). The business runs in one tz.
  const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  const vlc = (village || '').toLowerCase();
  const tlc = (taluk || '').toLowerCase();
  const oLat = order.delivered_lat ?? (typeof da.lat === 'number' ? da.lat : null);
  const oLng = order.delivered_lng ?? (typeof da.lng === 'number' ? da.lng : null);

  // Coverage from users.service_areas ([{taluk, villages[]}]); the legacy flat
  // service_villages[] still counts as a village match so nothing regresses.
  const covers = (a) => {
    const areas = Array.isArray(a.service_areas) ? a.service_areas : [];
    let cv = false;
    let ct = false;
    for (const ar of areas) {
      if (tlc && String(ar.taluk || '').toLowerCase() === tlc) ct = true;
      if (
        vlc &&
        Array.isArray(ar.villages) &&
        ar.villages.some((v) => String(v).toLowerCase() === vlc)
      ) {
        cv = true;
      }
    }
    if (
      !cv &&
      vlc &&
      Array.isArray(a.service_villages) &&
      a.service_villages.some((v) => String(v).toLowerCase() === vlc)
    ) {
      cv = true;
    }
    return { cv, ct };
  };

  const shape = (a) => {
    const { cv, ct } = covers(a);
    const distance_m =
      oLat != null && oLng != null && a.agent_lat != null && a.agent_lng != null
        ? distanceMeters(Number(oLat), Number(oLng), Number(a.agent_lat), Number(a.agent_lng))
        : null;
    return {
      id: a.id,
      name: a.fname + (a.lname ? ' ' + a.lname : ''),
      phone: a.phone,
      vehicle: a.agent_vehicle || '',
      service_villages: a.service_villages || [],
      hub_id: a.hub_id || null,
      ready_today: a.available_date === today,
      covers_village: cv,
      covers_taluk: ct,
      distance_m,
    };
  };

  // Ready-first, then better coverage (village > taluk > none), then nearest, then
  // name — the order the picker defaults to and displays in.
  const rankKey = (s) => [
    s.ready_today ? 0 : 1,
    s.covers_village ? 0 : s.covers_taluk ? 1 : 2,
    s.distance_m ?? Infinity,
  ];
  const bySort = (x, y) => {
    const kx = rankKey(x);
    const ky = rankKey(y);
    for (let i = 0; i < kx.length; i++) if (kx[i] !== ky[i]) return kx[i] - ky[i];
    return x.name.localeCompare(y.name);
  };

  const shaped = (all || []).map(shape);
  const matched = shaped.filter((s) => s.covers_village || s.covers_taluk).sort(bySort);
  const allSorted = [...shaped].sort(bySort);

  res.json({ leg, village: village || null, taluk: taluk || null, matched, all: allSorted });
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

  const { data: history, error: historyErr } = await supabase
    .from('order_history')
    .select('label, note, ts')
    .eq('order_id', order.id)
    .order('ts', { ascending: true });

  if (historyErr) {
    console.error('Order tracking history lookup failed:', historyErr.message);
    return res.status(500).json({ error: 'Could not load tracking for this order. Please try again.' });
  }

  const route  = resolveRoute(order);
  // Defensive: an unrecognised route must not throw here. This handler is async, and
  // an async throw in Express 4 is not caught — the response never goes out and the
  // caller hangs rather than getting an error.
  const stages = STAGE_MAP[route] || STAGE_MAP.direct;

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
