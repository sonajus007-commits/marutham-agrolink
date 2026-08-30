// ─────────────────────────────────────────────────────────────────────────────
// Delivery-agent ↔ order region accountability.
//
// The eligible-agents picker (routes/delivery.js) SUGGESTS agents ranked by
// coverage, but assignment (POST /assign, and the VCO verify path) historically
// only checked that the person is a delivery-capable role — never that their
// region actually reaches the order. That let a wrong-region agent be assigned,
// and left "who is responsible?" unanswerable. These helpers are the shared,
// testable rule both assignment points now enforce.
//
// Model (unchanged from eligible-agents):
//   • users.service_areas = [{ taluk, villages:[…] }]  (structured coverage)
//   • users.service_villages = […]                     (legacy flat village list)
//   • A Delivery Agent is a DISTRICT-WIDE fallback — district match is enough.
//   • A can_deliver VCO is "nearby only" — must cover the village or taluk.
//
// Enforcement principle: only BLOCK on positive evidence of a mismatch. Missing
// data (no district on either side, a VCO with no coverage configured) is never
// grounds to reject — otherwise incomplete legacy rows would break assignment.
// ─────────────────────────────────────────────────────────────────────────────

function norm(v) {
  return String(v == null ? '' : v).trim().toLowerCase();
}

// Does this agent's configured coverage reach the given village / taluk?
// Returns { cv, ct } — covers-village, covers-taluk. Mirrors the covers() logic
// in the eligible-agents route so the picker and the guard agree.
function coversLocation(agent, village, taluk) {
  const vlc = norm(village);
  const tlc = norm(taluk);
  const areas = Array.isArray(agent.service_areas) ? agent.service_areas : [];
  let cv = false;
  let ct = false;
  for (const ar of areas) {
    if (tlc && norm(ar.taluk) === tlc) ct = true;
    if (vlc && Array.isArray(ar.villages) && ar.villages.some((v) => norm(v) === vlc)) cv = true;
  }
  if (!cv && vlc && Array.isArray(agent.service_villages) && agent.service_villages.some((v) => norm(v) === vlc)) {
    cv = true;
  }
  return { cv, ct };
}

function isDeliveryAgent(agent) {
  return agent && agent.role === 'admin' && agent.admin_role === 'Delivery Agent';
}
function isDeliveryVCO(agent) {
  return agent && agent.role === 'admin' && agent.admin_role === 'VCO' && agent.can_deliver === true;
}

// The consumer-side (delivery-leg) location an order is bound for: an explicit
// delivery village, else the order village, else the address block. Taluk comes
// from the address block. Used to judge whether a last-mile agent reaches it.
function orderDeliveryTarget(order) {
  const da = (order && order.delivery_address) || {};
  return {
    village: order.delivery_village || order.village || da.village_town || null,
    taluk: (da.taluk || '').trim() || null,
  };
}

// The accountability rule. Returns:
//   { ok: true }                              — the agent may take this order
//   { ok: false, reason, agentRegion, orderRegion } — with a machine-readable
//     reason ('role' | 'district' | 'coverage') the caller turns into a message.
//
// `force` is NOT decided here — a caller with the authority may override a
// false result and log it. This function only reports whether the pairing is
// clean.
function agentServesOrder(agent, order) {
  if (!isDeliveryAgent(agent) && !isDeliveryVCO(agent)) {
    return { ok: false, reason: 'role' };
  }

  const agentDistrict = norm(agent.district);
  const orderDistrict = norm(order.district);
  // District is the regional boundary. Block only when both are known and differ.
  if (agentDistrict && orderDistrict && agentDistrict !== orderDistrict) {
    return {
      ok: false,
      reason: 'district',
      agentRegion: agent.district,
      orderRegion: order.district,
    };
  }

  // A can_deliver VCO is nearby-only: if they have coverage configured and it
  // does not reach this order, they are out of area. A VCO with no coverage data
  // is not blocked on this rule (district already passed).
  if (isDeliveryVCO(agent)) {
    const hasCoverage =
      (Array.isArray(agent.service_areas) && agent.service_areas.length > 0) ||
      (Array.isArray(agent.service_villages) && agent.service_villages.length > 0);
    if (hasCoverage) {
      const { village, taluk } = orderDeliveryTarget(order);
      // Check both the delivery target and the collection village — a VCO who
      // covers either end legitimately serves the order.
      const dt = coversLocation(agent, village, taluk);
      const ct = coversLocation(agent, order.village, taluk);
      if (!dt.cv && !dt.ct && !ct.cv && !ct.ct) {
        return {
          ok: false,
          reason: 'coverage',
          agentRegion: agent.district || null,
          orderRegion: [village, order.district].filter(Boolean).join(', ') || null,
        };
      }
    }
  }

  return { ok: true };
}

// A human-readable line for a blocked pairing, reused by both assignment points.
function coverageBlockMessage(agentName, result) {
  if (result.reason === 'role') return `${agentName || 'That user'} cannot take deliveries.`;
  if (result.reason === 'district') {
    return `${agentName || 'That agent'} serves ${result.agentRegion || 'another district'}, but this order is in ${result.orderRegion || 'a different district'}. Assign an agent from the order's region, or override with force.`;
  }
  if (result.reason === 'coverage') {
    return `${agentName || 'That agent'}'s service area does not cover ${result.orderRegion || "this order's area"}. Pick a covering agent, or override with force.`;
  }
  return `${agentName || 'That agent'} does not serve this order's region.`;
}

module.exports = {
  coversLocation,
  orderDeliveryTarget,
  agentServesOrder,
  coverageBlockMessage,
  isDeliveryAgent,
  isDeliveryVCO,
};
