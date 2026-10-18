const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('./helpers/fakeSupabase');
const {
  assignFields,
  clearFields,
  pendingLegFor,
  legForOrder,
  sweepExpiredAssignments,
  ACCEPT_WINDOW_MS,
} = require('../utils/agentAssignment');

const RAVI = { id: 'a1', fname: 'Ravi', lname: 'K', phone: '999', agent_vehicle: 'Bike' };
const NOW = new Date('2026-10-18T05:00:00Z');

test('assignFields: another agent is pending with a 15-min deadline', () => {
  const f = assignFields('agent', RAVI, 'vco1', NOW);
  assert.equal(f.agent_id, 'a1');
  assert.equal(f.agent_name, 'Ravi K');
  assert.equal(f.agent_vehicle, 'Bike');
  assert.equal(f.agent_assign_status, 'pending');
  assert.equal(f.agent_assigned_by, 'vco1');
  assert.equal(new Date(f.agent_accept_deadline).getTime() - NOW.getTime(), ACCEPT_WINDOW_MS);
  assert.equal(ACCEPT_WINDOW_MS, 15 * 60 * 1000);
});

test('assignFields: self-assignment is accepted outright; collection leg has its own columns', () => {
  const f = assignFields('collection', { ...RAVI, id: 'vco1' }, 'vco1', NOW);
  assert.equal(f.collection_agent_id, 'vco1');
  assert.equal(f.collection_assign_status, 'accepted');
  assert.equal(f.collection_accept_deadline, null);
  assert.equal(f.agent_id, undefined, 'never touches the last-mile agent');
  assert.equal(f.agent_vehicle, undefined);
});

test('clearFields empties only its leg', () => {
  const c = clearFields('collection');
  assert.equal(c.collection_agent_id, null);
  assert.equal(c.agent_id, undefined);
});

test('pendingLegFor / legForOrder', () => {
  assert.equal(pendingLegFor({ collection_agent_id: 'a1', collection_assign_status: 'pending' }, 'a1'), 'collection');
  assert.equal(pendingLegFor({ agent_id: 'a1', agent_assign_status: 'accepted' }, 'a1'), null);
  assert.equal(pendingLegFor({ agent_id: 'a1', agent_assign_status: 'pending' }, 'a2'), null);
  assert.equal(legForOrder({ route: 'hub', status: 'VCO Verified' }), 'collection');
  assert.equal(legForOrder({ route: 'hub', status: 'At Hub' }), 'agent');
  assert.equal(legForOrder({ route: 'direct', status: 'VCO Verified' }), 'agent');
});

test('sweep: clears an expired pending leg, logs it, tells the assigner', async () => {
  const db = fakeSupabase({
    'orders:select': (ctx) => ({
      data: ctx.cols.includes('collection_agent_id') ? [] : [{
        id: 'o1', code: 'ORD1', agent_id: 'a1', agent_name: 'Ravi K', agent_assigned_by: 'vco1',
        agent_accept_deadline: '2026-10-18T04:00:00Z',
      }],
    }),
    'orders:update': { data: [{ id: 'o1' }] },
  });
  const sent = [];
  const { expired } = await sweepExpiredAssignments({ db, notify: async (id, n) => sent.push([id, n]), now: NOW });

  assert.equal(expired, 1);
  const upd = db.callsTo('orders', 'update')[0];
  assert.equal(upd.payload.agent_id, null);
  assert.equal(upd.payload.agent_assign_status, null);
  // CAS: only clears if still pending for the same agent
  assert.ok(upd.filters.some(([op, col, v]) => op === 'eq' && col === 'agent_assign_status' && v === 'pending'));
  assert.ok(upd.filters.some(([op, col, v]) => op === 'eq' && col === 'agent_id' && v === 'a1'));
  assert.equal(db.callsTo('order_history', 'insert').length, 1);
  assert.equal(sent[0][0], 'vco1');
  assert.equal(sent[0][1].type, 'agent_job_expired');
});

test('sweep: an accept that raced it (no row cleared) sends nothing', async () => {
  const db = fakeSupabase({
    'orders:select': (ctx) => ({
      data: ctx.cols.includes('collection_agent_id') ? [] : [{ id: 'o1', code: 'ORD1', agent_id: 'a1', agent_assigned_by: 'vco1' }],
    }),
    'orders:update': { data: [] },
  });
  const sent = [];
  const { expired } = await sweepExpiredAssignments({ db, notify: async (...a) => sent.push(a), now: NOW });
  assert.equal(expired, 0);
  assert.equal(sent.length, 0);
});
