// Who gets the "ready for verification" alert: service area first, then the nearest
// VCOs within dispatch.vcoAlertRadiusKm of the farm, then the whole district.
const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { fakeSupabase } = require('./helpers/fakeSupabase');

const ROOT = path.join(__dirname, '..');
const SUPA = path.join(ROOT, 'db', 'supabase.js');
const MODS = ['utils/collectionNotify.js', 'utils/notifications.js', 'utils/push.js'].map((m) => path.join(ROOT, m));

function load(db) {
  for (const m of [SUPA, ...MODS]) delete require.cache[m];
  require.cache[SUPA] = { id: SUPA, filename: SUPA, loaded: true, exports: db };
  return require('../utils/collectionNotify');
}
afterEach(() => {
  for (const m of [SUPA, ...MODS]) delete require.cache[m];
});

const ORDER = { id: 'o1', code: 'ORD1', district: 'Pudukkottai', village: 'Perumanadu', seller_name: 'Murugan' };
const FARM = { id: 'f1', farm_lat: 10.38, farm_lng: 78.82 };

function db(vcos) {
  return fakeSupabase({
    'users:select': (ctx) => ({
      data: ctx.cols.includes('service_areas') ? vcos : [FARM],
    }),
    'order_items:select': { data: [{ farmer_id: 'f1', name: 'Tomatoes', qty: 5, unit: 'kg' }] },
  });
}
const alerted = (d) => d.callsTo('notifications', 'insert').map((c) => c.payload);

test('a VCO whose service area covers the village gets it — with items and km', async () => {
  const d = db([
    { id: 'v1', service_villages: ['Perumanadu'], agent_lat: 10.39, agent_lng: 78.82 },
    { id: 'v2', service_villages: ['Elsewhere'], agent_lat: 10.38, agent_lng: 78.82 },
  ]);
  const { notifyCollectionParties } = load(d);
  const r = await notifyCollectionParties(ORDER, 'packed');
  assert.equal(r.vco, 1);
  const [n] = alerted(d);
  assert.equal(n.user_id, 'v1');
  assert.equal(n.title, 'Ready for verification');
  assert.match(n.body, /Murugan/);
  assert.match(n.body, /Tomatoes 5 kg/);
  assert.match(n.body, /~1\.1 km/);
});

test('no service-area match → the VCOs within 10 km of the farm', async () => {
  const d = db([
    { id: 'near', service_villages: ['X'], agent_lat: 10.40, agent_lng: 78.82 }, // ~2 km
    { id: 'far', service_villages: ['Y'], agent_lat: 10.80, agent_lng: 78.82 }, // ~47 km
  ]);
  const { notifyCollectionParties } = load(d);
  await notifyCollectionParties(ORDER, 'packed');
  assert.deepEqual(alerted(d).map((n) => n.user_id), ['near']);
});

test('nobody covers it and nobody is near → the whole district', async () => {
  const d = db([
    { id: 'v1', service_villages: ['X'] },
    { id: 'v2', service_villages: ['Y'], agent_lat: 10.80, agent_lng: 78.82 },
  ]);
  const { notifyCollectionParties } = load(d);
  const r = await notifyCollectionParties(ORDER, 'packed');
  assert.equal(r.vco, 2);
});
