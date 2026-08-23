// Unit tests for utils/hubSuggest — the deterministic destination-hub suggestion
// for a via-hub delivery. Like hubResolver it is BEST-EFFORT (never throws, a miss
// degrades to an empty list + null suggestion), and its RANKING is the contract:
// the consumer's own taluk first, then nearest by pin, then name.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { fakeSupabase } = require('./helpers/fakeSupabase');
const { suggestDeliveryHubs } = require('../utils/hubSuggest');

const AT = { state: 'Tamil Nadu', district: 'Pudukkottai', taluk: 'Thirumayam' };

describe('suggestDeliveryHubs', () => {
  test('suggests the hub in the consumer’s own taluk before nearer out-of-taluk hubs', async () => {
    const supa = fakeSupabase({
      'hubs:select': {
        data: [
          // Closer by distance but a different taluk — must NOT win.
          { id: 'near', name: 'Alangudi Hub', taluk: 'Alangudi', lat: 10.0, lng: 78.0 },
          // The consumer's taluk, farther away — must win on the exact-area rule.
          { id: 'mine', name: 'Thirumayam Hub', taluk: 'Thirumayam', lat: 12.0, lng: 79.0 },
        ],
      },
    });
    const res = await suggestDeliveryHubs(supa, { ...AT, lat: 10.01, lng: 78.01 });
    assert.equal(res.suggested_hub_id, 'mine');
    assert.equal(res.hubs[0].id, 'mine');
    assert.equal(res.hubs[0].same_taluk, true);
  });

  test('with no taluk match, suggests the nearest hub by pin', async () => {
    const supa = fakeSupabase({
      'hubs:select': {
        data: [
          { id: 'far', name: 'Far Hub', taluk: 'Gandarvakottai', lat: 11.0, lng: 79.0 },
          { id: 'close', name: 'Close Hub', taluk: 'Alangudi', lat: 10.0, lng: 78.0 },
        ],
      },
    });
    const res = await suggestDeliveryHubs(supa, {
      state: 'Tamil Nadu',
      district: 'Pudukkottai',
      taluk: 'Nowhere', // matches neither
      lat: 10.02,
      lng: 78.02,
    });
    assert.equal(res.suggested_hub_id, 'close');
  });

  test('a taluk’s primary (oldest) office wins when several share the taluk', async () => {
    // The fetch is ordered created_at asc, so the fake feeds them oldest-first; the
    // stable sort must keep the first same-taluk row ahead of the second.
    const supa = fakeSupabase({
      'hubs:select': {
        data: [
          { id: 'primary', name: 'Thirumayam Hub 1', taluk: 'Thirumayam' },
          { id: 'second', name: 'Thirumayam Hub 2', taluk: 'Thirumayam' },
        ],
      },
    });
    const res = await suggestDeliveryHubs(supa, AT);
    assert.equal(res.suggested_hub_id, 'primary');
  });

  test('no district → no query, empty result', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [{ id: 'x' }] } });
    const res = await suggestDeliveryHubs(supa, { taluk: 'Thirumayam' });
    assert.deepEqual(res, { suggested_hub_id: null, hubs: [] });
    assert.equal(supa.callsTo('hubs', 'select').length, 0);
  });

  test('a failed read degrades to an empty list (it only ever advises)', async () => {
    const supa = fakeSupabase({ 'hubs:select': { error: { message: 'timeout' } } });
    const res = await suggestDeliveryHubs(supa, AT);
    assert.deepEqual(res, { suggested_hub_id: null, hubs: [] });
  });

  test('scopes to active taluk hubs in the delivery district', async () => {
    const supa = fakeSupabase({ 'hubs:select': { data: [] } });
    await suggestDeliveryHubs(supa, AT);
    const call = supa.callsTo('hubs', 'select')[0];
    const eqPairs = Object.fromEntries(
      call.filters.filter(([op]) => op === 'eq').map(([, c, v]) => [c, v]),
    );
    assert.equal(eqPairs.district, 'Pudukkottai');
    assert.equal(eqPairs.hub_type, 'taluk');
    assert.equal(eqPairs.is_active, true);
  });
});
