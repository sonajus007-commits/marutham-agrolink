// Locks the designation → login-role map (utils/designationRole) that both the
// create-staff and employee-edit flows depend on. Two invariants matter most:
// every mapped role is a role RBAC actually recognises, and management/org titles
// map to NOTHING (the escalation guard — an arbitrary title must never become a
// privileged login role).

const test = require('node:test');
const assert = require('node:assert/strict');
const { DESIGNATION_TO_ROLE, loginRoleForDesignation } = require('../utils/designationRole');
const rbac = require('../config/rbac');

test('every mapped login role is a role RBAC recognises', () => {
  for (const role of Object.values(DESIGNATION_TO_ROLE)) {
    assert.ok(
      Object.prototype.hasOwnProperty.call(rbac.ADMIN_ROLE_TO_ROLE, role),
      `${role} must be a real login role RBAC can resolve`,
    );
  }
});

test('field designations resolve to their operational login role', () => {
  assert.equal(loginRoleForDesignation('Field Associate'), 'VCO');
  assert.equal(loginRoleForDesignation('Collection Officer(VCO)'), 'VCO');
  assert.equal(loginRoleForDesignation('Delivery Associate'), 'Delivery Agent');
  assert.equal(loginRoleForDesignation('Hub Incharge'), 'Hub Incharge');
});

test('management/org titles map to null — the escalation guard holds', () => {
  for (const title of ['Manager', 'Senior Manager', 'General Manager', 'Assistant Manager', 'CEO', 'CTO']) {
    assert.equal(loginRoleForDesignation(title), null, `${title} must not become a login role`);
  }
});

test('an unknown designation resolves to null, never a raw title', () => {
  assert.equal(loginRoleForDesignation('Chief Vibes Officer'), null);
  assert.equal(loginRoleForDesignation(undefined), null);
});
