// Locks the delivery-agent ↔ order region rule (utils/agentCoverage). The guard
// blocks a wrong-region assignment while never rejecting on missing data — these
// assert both the block cases and the deliberate "unknown ⇒ allow" ones.

const test = require('node:test');
const assert = require('node:assert/strict');
const { agentServesOrder, coversLocation } = require('../utils/agentCoverage');

const DA = (over = {}) => ({ role: 'admin', admin_role: 'Delivery Agent', district: 'Pudukkottai', ...over });
const VCO = (over = {}) => ({ role: 'admin', admin_role: 'VCO', can_deliver: true, district: 'Pudukkottai', ...over });
const order = (over = {}) => ({ district: 'Pudukkottai', village: 'Keeranur', delivery_address: {}, ...over });

test('a delivery agent in the order district serves it (district-wide fallback)', () => {
  assert.equal(agentServesOrder(DA(), order()).ok, true);
});

test('a delivery agent in a DIFFERENT district is blocked with reason "district"', () => {
  const r = agentServesOrder(DA({ district: 'Thanjavur' }), order());
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'district');
  assert.equal(r.agentRegion, 'Thanjavur');
  assert.equal(r.orderRegion, 'Pudukkottai');
});

test('a non-delivery role is blocked with reason "role"', () => {
  assert.equal(agentServesOrder({ role: 'admin', admin_role: 'Hub Incharge' }, order()).reason, 'role');
  assert.equal(agentServesOrder({ role: 'admin', admin_role: 'VCO', can_deliver: false }, order()).reason, 'role');
});

test('a can_deliver VCO with coverage reaching the order serves it', () => {
  const vco = VCO({ service_areas: [{ taluk: 'Kulathur', villages: ['Keeranur'] }] });
  assert.equal(agentServesOrder(vco, order()).ok, true);
});

test('a can_deliver VCO whose coverage misses the order is blocked with reason "coverage"', () => {
  const vco = VCO({ service_areas: [{ taluk: 'Aranthangi', villages: ['Somewhere'] }] });
  const r = agentServesOrder(vco, order({ delivery_village: 'Keeranur' }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'coverage');
});

test('a VCO with NO coverage configured is not blocked on coverage (unknown ⇒ allow)', () => {
  assert.equal(agentServesOrder(VCO(), order()).ok, true);
});

test('legacy flat service_villages still counts as village coverage', () => {
  const vco = VCO({ service_villages: ['Keeranur'] });
  assert.equal(agentServesOrder(vco, order({ delivery_village: 'Keeranur' })).ok, true);
});

test('missing district on either side is never grounds to block', () => {
  assert.equal(agentServesOrder(DA({ district: null }), order()).ok, true);
  assert.equal(agentServesOrder(DA(), order({ district: null })).ok, true);
});

test('coversLocation matches taluk and village case-insensitively', () => {
  const a = { service_areas: [{ taluk: 'Kulathur', villages: ['Keeranur'] }] };
  assert.deepEqual(coversLocation(a, 'keeranur', null), { cv: true, ct: false });
  assert.deepEqual(coversLocation(a, null, 'KULATHUR'), { cv: false, ct: true });
  assert.deepEqual(coversLocation(a, 'nowhere', 'nowhere'), { cv: false, ct: false });
});
