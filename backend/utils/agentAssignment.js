// Agent assignment with accept / decline (migration 070).
//
// Two independent legs on an order:
//   • 'agent'      — orders.agent_*: the direct-route delivery agent (named by the VCO
//                    at verify) or the hub's last-mile agent (named at the hub).
//   • 'collection' — orders.collection_*: on the hub route, the agent who carries the
//                    parcel VCO → hub and hands it to the Hub Incharge.
//
// A named agent is 'pending' until they accept, inside dispatch.acceptWindowMin. A
// decline or a timeout clears the leg and tells whoever assigned it. Self-assignment
// (a VCO carrying it themselves) is accepted outright. The pickup scan by the named
// agent also counts as acceptance — physically taking the parcel IS accepting it.
//
// Pure helpers + injected I/O (db, notify) so the sweep and responses are testable.

const platform = require('../config/platform');

const ACCEPT_WINDOW_MS = platform.dispatch.acceptWindowMin * 60 * 1000;

const LEG_COLS = {
  agent: {
    id: 'agent_id',
    name: 'agent_name',
    phone: 'agent_phone',
    status: 'agent_assign_status',
    deadline: 'agent_accept_deadline',
    by: 'agent_assigned_by',
  },
  collection: {
    id: 'collection_agent_id',
    name: 'collection_agent_name',
    phone: 'collection_agent_phone',
    status: 'collection_assign_status',
    deadline: 'collection_accept_deadline',
    by: 'collection_assigned_by',
  },
};

const fullName = (u) => `${u.fname || ''}${u.lname ? ' ' + u.lname : ''}`.trim();

/** Which leg a pickup-stage (re)assignment fills: a verified hub parcel needs its
 *  VCO → hub carrier; anything else is the agent leg. */
function legForOrder(order) {
  return order.route === 'hub' && order.status === 'VCO Verified' ? 'collection' : 'agent';
}

/** Columns that name `agent` on `leg`. Self-assignment is accepted at once. */
function assignFields(leg, agent, assignerId, now = new Date()) {
  const c = LEG_COLS[leg];
  const self = agent.id === assignerId;
  const out = {
    [c.id]: agent.id,
    [c.name]: fullName(agent),
    [c.phone]: agent.phone || null,
    [c.status]: self ? 'accepted' : 'pending',
    [c.deadline]: self ? null : new Date(now.getTime() + ACCEPT_WINDOW_MS).toISOString(),
    [c.by]: assignerId || null,
  };
  if (leg === 'agent') out.agent_vehicle = agent.agent_vehicle || null;
  return out;
}

/** Columns that empty `leg` (a decline / timeout / reassignment). */
function clearFields(leg) {
  const c = LEG_COLS[leg];
  const out = { [c.id]: null, [c.name]: null, [c.phone]: null, [c.status]: null, [c.deadline]: null, [c.by]: null };
  if (leg === 'agent') out.agent_vehicle = null;
  return out;
}

/** Columns that accept `leg`. */
function acceptFields(leg) {
  const c = LEG_COLS[leg];
  return { [c.status]: 'accepted', [c.deadline]: null };
}

/** The leg `userId` holds a PENDING assignment on, or null. */
function pendingLegFor(order, userId) {
  for (const leg of ['collection', 'agent']) {
    const c = LEG_COLS[leg];
    if (order[c.id] === userId && order[c.status] === 'pending') return leg;
  }
  return null;
}

/** The job alert to the named agent. `where` is the pickup description. */
function assignedCopy(order, leg, { assignerName, where, km, itemCount, hubName }) {
  const kmTxt = km != null ? ` (~${km < 10 ? km.toFixed(1) : Math.round(km)} km away)` : '';
  const items = itemCount ? `${itemCount} item${itemCount === 1 ? '' : 's'}, ` : '';
  const task =
    leg === 'collection'
      ? `collect ${items}order ${order.code} from ${where}${kmTxt} and hand it to ${hubName || 'the hub'}`
      : order.status === 'At Hub'
        ? `collect order ${order.code} from ${where}${kmTxt} and deliver it to ${order.consumer_name || 'the customer'}`
        : `collect ${items}order ${order.code} from ${where}${kmTxt} and deliver it to ${order.consumer_name || 'the customer'}`;
  return {
    type: 'agent_job_offer',
    title: 'New delivery job — accept within 15 min',
    body: `${assignerName || 'Your VCO'} asked you to ${task}. Accept or decline in the app.`,
    data: { order_id: order.id, code: order.code, leg },
  };
}

/**
 * Expire pending assignments past their deadline: clear the leg, log it, tell the
 * assigner. One query per leg; a failed read logs and skips that leg.
 * @returns {Promise<{ expired: number }>}
 */
async function sweepExpiredAssignments({ db, notify, now = new Date() }) {
  let expired = 0;
  for (const leg of ['agent', 'collection']) {
    const c = LEG_COLS[leg];
    const { data, error } = await db
      .from('orders')
      .select(`id, code, ${c.id}, ${c.name}, ${c.by}, ${c.deadline}`)
      .eq(c.status, 'pending')
      .lt(c.deadline, now.toISOString());
    if (error) {
      console.error(`[AGENT SWEEP] ${leg} query failed:`, error.message);
      continue;
    }
    for (const o of data || []) {
      // Guarded on the same pending assignee, so an accept that raced the sweep wins.
      const { data: cleared, error: ue } = await db
        .from('orders')
        .update({ ...clearFields(leg), updated_at: now.toISOString() })
        .eq('id', o.id)
        .eq(c.id, o[c.id])
        .eq(c.status, 'pending')
        .select('id')
        .maybeSingle();
      if (ue) {
        console.error(`[AGENT SWEEP] clear ${o.id} failed:`, ue.message);
        continue;
      }
      if (!cleared) continue;
      expired++;
      const { error: he } = await db.from('order_history').insert({
        order_id: o.id,
        label: 'Agent Unassigned',
        note: `${o[c.name] || 'The agent'} did not accept within ${platform.dispatch.acceptWindowMin} min.`,
      });
      if (he) console.error(`[AGENT SWEEP] history ${o.id} failed:`, he.message);
      if (o[c.by]) {
        await notify(o[c.by], {
          type: 'agent_job_expired',
          title: 'Agent did not respond',
          body: `${o[c.name] || 'The agent'} did not accept order ${o.code} in time. Please assign another agent.`,
          data: { order_id: o.id, code: o.code, leg },
        });
      }
    }
  }
  return { expired };
}

module.exports = {
  LEG_COLS,
  ACCEPT_WINDOW_MS,
  legForOrder,
  assignFields,
  clearFields,
  acceptFields,
  pendingLegFor,
  assignedCopy,
  sweepExpiredAssignments,
  fullName,
};
