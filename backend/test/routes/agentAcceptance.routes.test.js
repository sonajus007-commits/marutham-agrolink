// Agent accept/decline + the hub-route collection agent (migration 070).
// Server closed in afterEach, never inline (see project_route_tests).

const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('../helpers/fakeSupabase');
const { mountRoute } = require('../helpers/app');

const VCO = { id: 'vco1', role: 'admin', admin_role: 'VCO', fname: 'Kumar', district: 'Pudukkottai' };
const RAVI = { id: 'a1', role: 'admin', admin_role: 'Delivery Agent', fname: 'Ravi', district: 'Pudukkottai' };
const OTHER = { id: 'a2', role: 'admin', admin_role: 'Delivery Agent', fname: 'Selvam', district: 'Pudukkottai' };
const HUB = { id: 'h1', role: 'admin', admin_role: 'Hub Incharge', fname: 'Ramesh', district: 'Pudukkottai' };

const RAVI_ROW = {
  id: 'a1', fname: 'Ravi', lname: 'K', phone: '999', role: 'admin', admin_role: 'Delivery Agent',
  district: 'Pudukkottai', status: 'active', agent_lat: 10.38, agent_lng: 78.82,
};

function order(extra = {}) {
  return {
    id: 'o1', code: 'ORD1', stage: 3, status: 'Packed', route: null, cancelled: false,
    district: 'Pudukkottai', village: 'Perumanadu', consumer_name: 'Priya', delivery_hub_id: 'hub9',
    ...extra,
  };
}

function db(o, more = {}) {
  return fakeSupabase({
    'orders:select': { data: [o] },
    'orders:update': (ctx) => ({ data: [{ ...o, ...ctx.payload }] }),
    'order_items:select': { data: [{ id: 'i1', name: 'Tomatoes', qty: 5, farmer_id: 'f1' }] },
    'users:select': { data: [RAVI_ROW] },
    'hubs:select': { data: [{ id: 'hub9', name: 'Pudukkottai Hub' }] },
    ...more,
  });
}

const WEIGHED = { items: [{ id: 'i1', verified_qty: 5 }] };
const notifs = (d) => d.callsTo('notifications', 'insert').map((c) => c.payload);

let app = null;
afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

test('verify via hub names a COLLECTION agent, pending, and alerts them', async () => {
  const d = db(order());
  app = await mountRoute('delivery', { supabase: d, user: VCO });
  const res = await app.post('/o1/scan', { ...WEIGHED, route: 'hub', collection_agent_id: 'a1' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const upd = d.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.status, 'VCO Verified');
  assert.equal(upd.collection_agent_id, 'a1');
  assert.equal(upd.collection_assign_status, 'pending');
  assert.ok(upd.collection_accept_deadline);
  assert.equal(upd.agent_id, undefined, 'the last-mile agent is the hub’s call');
  const offer = notifs(d).find((n) => n.type === 'agent_job_offer');
  assert.equal(offer.user_id, 'a1');
  assert.match(offer.body, /ORD1/);
  assert.match(offer.body, /Pudukkottai Hub/);
});

test('verify direct names the delivery agent, pending', async () => {
  const d = db(order());
  app = await mountRoute('delivery', { supabase: d, user: VCO });
  const res = await app.post('/o1/scan', { ...WEIGHED, route: 'direct', agent_id: 'a1' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const upd = d.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.agent_id, 'a1');
  assert.equal(upd.agent_assign_status, 'pending');
  assert.equal(upd.agent_assigned_by, 'vco1');
});

test('another Delivery Agent cannot pick up a parcel named for someone else', async () => {
  const d = db(order({ stage: 4, status: 'VCO Verified', route: 'hub', collection_agent_id: 'a1',
    collection_agent_name: 'Ravi K', collection_assign_status: 'pending' }));
  app = await mountRoute('delivery', { supabase: d, user: OTHER });
  const res = await app.post('/o1/scan', {});
  assert.equal(res.status, 403);
  assert.equal(d.callsTo('orders', 'update').length, 0);
});

test('the named agent scanning the pickup accepts the job', async () => {
  const d = db(order({ stage: 4, status: 'VCO Verified', route: 'hub', collection_agent_id: 'a1',
    collection_assign_status: 'pending' }));
  app = await mountRoute('delivery', { supabase: d, user: RAVI });
  const res = await app.post('/o1/scan', {});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const upd = d.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.status, 'In Transit');
  assert.equal(upd.collection_assign_status, 'accepted');
});

test('hub receipt records who handed the parcel over', async () => {
  const d = db(order({ stage: 5, status: 'In Transit', route: 'hub', collection_agent_name: 'Ravi K' }));
  app = await mountRoute('delivery', { supabase: d, user: HUB });
  const res = await app.post('/o1/scan', {});
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const notes = d.callsTo('order_history', 'insert').map((c) => c.payload.note);
  assert.ok(notes.some((n) => /Ravi K handed the parcel to Hub Ramesh/.test(n)), notes.join(' | '));
});

test('agent accepts: CAS on still-pending, assigner + receiving hub told', async () => {
  const d = db(order({ stage: 4, status: 'VCO Verified', route: 'hub', collection_agent_id: 'a1',
    collection_assign_status: 'pending', collection_assigned_by: 'vco1' }),
  { 'users:select': { data: [{ id: 'h1' }] } });
  app = await mountRoute('delivery', { supabase: d, user: RAVI });
  const res = await app.post('/o1/agent-response', { accept: true });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const upd = d.callsTo('orders', 'update')[0];
  assert.equal(upd.payload.collection_assign_status, 'accepted');
  assert.ok(upd.filters.some(([op, col, v]) => op === 'eq' && col === 'collection_assign_status' && v === 'pending'));
  const n = notifs(d);
  assert.ok(n.some((x) => x.user_id === 'vco1' && x.type === 'agent_job_accepted'));
  const inbound = d.callsTo('notifications', 'insert').flatMap((c) => [].concat(c.payload));
  assert.ok(inbound.some((x) => x.user_id === 'h1' && x.type === 'inbound_order'));
});

test('agent declines: the leg is cleared and the assigner asked to re-pick', async () => {
  const d = db(order({ stage: 4, status: 'VCO Verified', route: 'direct', agent_id: 'a1',
    agent_assign_status: 'pending', agent_assigned_by: 'vco1' }));
  app = await mountRoute('delivery', { supabase: d, user: RAVI });
  const res = await app.post('/o1/agent-response', { accept: false, reason: 'Bike broke down' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  const upd = d.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.agent_id, null);
  assert.equal(upd.agent_assign_status, null);
  const n = notifs(d).find((x) => x.type === 'agent_job_declined');
  assert.equal(n.user_id, 'vco1');
  assert.match(n.body, /Bike broke down/);
});

test('only the agent holding a pending job may answer it', async () => {
  const d = db(order({ stage: 4, status: 'VCO Verified', agent_id: 'a1', agent_assign_status: 'pending' }));
  app = await mountRoute('delivery', { supabase: d, user: OTHER });
  const res = await app.post('/o1/agent-response', { accept: true });
  assert.equal(res.status, 409);
  assert.equal(d.callsTo('orders', 'update').length, 0);
});

test('a VCO re-picks the collection agent of a verified hub parcel', async () => {
  const d = db(order({ stage: 4, status: 'VCO Verified', route: 'hub' }));
  app = await mountRoute('delivery', { supabase: d, user: VCO });
  const res = await app.post('/o1/assign', { agent_id: 'a1' });

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.leg, 'collection');
  const upd = d.callsTo('orders', 'update')[0].payload;
  assert.equal(upd.collection_agent_id, 'a1');
  assert.equal(upd.collection_assign_status, 'pending');
});

test('a VCO cannot reassign once the parcel has left the village', async () => {
  const d = db(order({ stage: 6, status: 'At Hub', route: 'hub' }));
  app = await mountRoute('delivery', { supabase: d, user: VCO });
  const res = await app.post('/o1/assign', { agent_id: 'a1' });
  assert.equal(res.status, 403);
});

test('eligible agents are ranked by distance from the PICKUP point, not the customer', async () => {
  const d = fakeSupabase({
    // Customer pinned ~45 km away; the farm is where the parcel is.
    'orders:select': { data: [order({ delivery_address: { lat: 10.785, lng: 78.82 } })] },
    'order_items:select': { data: [{ farmer_id: 'f1' }] },
    'users:select': (ctx) => ({
      data: ctx.cols.includes('farm_lat')
        ? [{ id: 'f1', farm_lat: 10.38, farm_lng: 78.82 }]
        : [
            { id: 'near', fname: 'Near', role: 'admin', admin_role: 'Delivery Agent', district: 'Pudukkottai',
              status: 'active', agent_lat: 10.39, agent_lng: 78.82 },
            { id: 'bycust', fname: 'ByCustomer', role: 'admin', admin_role: 'Delivery Agent', district: 'Pudukkottai',
              status: 'active', agent_lat: 10.785, agent_lng: 78.82 },
          ],
    }),
  });
  app = await mountRoute('delivery', { supabase: d, user: VCO });
  const res = await app.get('/o1/eligible-agents?leg=delivery');

  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.radius_km, 10);
  const [first, second] = res.body.all;
  assert.equal(first.id, 'near');
  assert.equal(first.within_radius, true);
  assert.equal(second.within_radius, false);
});
