// Unit tests for utils/hubResolver — the order → hub attribution lookup.
//
// The whole point of this helper is that it is BEST-EFFORT: it must never throw and
// never make a checkout fail. Every miss — incomplete location, no hub, a failed
// read — has to degrade to null. These pin exactly that.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('./helpers/fakeSupabase');
const { resolveTalukHubId } = require('../utils/hubResolver');

const LOC = { state: 'Tamil Nadu', district: 'Pudukkottai', taluk: 'Thirumayam' };

describe('resolveTalukHubId', () => {
  test('returns the taluk hub id when one exists', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [{ id: 'hub-1' }] } });
    assert.equal(await resolveTalukHubId(supa, LOC), 'hub-1');
  });

  test('returns null when no hub exists for the taluk (0 rows is an answer, not an error)', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [] } });
    assert.equal(await resolveTalukHubId(supa, LOC), null);
  });

  test('returns null without querying when the location is incomplete', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [{ id: 'hub-1' }] } });
    assert.equal(await resolveTalukHubId(supa, { state: 'TN', district: 'X', taluk: null }), null);
    assert.equal(await resolveTalukHubId(supa, {}), null);
    assert.equal(await resolveTalukHubId(supa), null);
    // Never touched the DB — an incomplete address short-circuits.
    assert.equal(supa.callsTo('hubs', 'select').length, 0);
  });

  test('a failed read degrades to null (attribution must not fail the checkout)', async () => {
    const supa = fakeSupabase({ 'hubs:select': { error: { message: 'timeout' } } });
    assert.equal(await resolveTalukHubId(supa, LOC), null);
  });

  test('scopes the query to a taluk hub at the exact location', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [{ id: 'hub-1' }] } });
    await resolveTalukHubId(supa, LOC);
    const call = supa.callsTo('hubs', 'select')[0];
    const eqPairs = Object.fromEntries(call.filters.filter(([op]) => op === 'eq').map(([, c, v]) => [c, v]));
    assert.equal(eqPairs.state, 'Tamil Nadu');
    assert.equal(eqPairs.district, 'Pudukkottai');
    assert.equal(eqPairs.taluk, 'Thirumayam');
    assert.equal(eqPairs.hub_type, 'taluk');
  });
});
