// Locks the canonical RBAC matrix (backend/config/rbac.js) against accidental
// drift. These assert the SHAPE and a handful of load-bearing cells that the route
// guards and the frontend both depend on — not every cell (that would just restate
// the matrix), but the invariants that, if broken, silently mis-authorize someone.

const test = require('node:test');
const assert = require('node:assert/strict');
const rbac = require('../config/rbac');

const cell = (role, mod) => rbac.resolveMatrix().find((r) => r.roleKey === role && r.moduleKey === mod);
const actions = (role, mod) => cell(role, mod).actions.sort().join(',');
const scope = (role, mod) => cell(role, mod).scope;

test('matrix is complete: every role × module resolves', () => {
  const rows = rbac.resolveMatrix();
  assert.equal(rows.length, rbac.ROLE_KEYS.length * rbac.MODULE_KEYS.length);
  assert.equal(rbac.ROLE_KEYS.length, 15);
  assert.equal(rbac.MODULE_KEYS.length, 32);
});

test('Admin can at least view every module', () => {
  for (const m of rbac.MODULE_KEYS) {
    assert.ok(cell('admin', m).actions.includes('view'), `admin should at least view ${m}`);
  }
});

test('Admin has Full Control over the core operational + governance modules', () => {
  // Admin is ✅ across sales/orders/sellers/consumers/config/role-management. It is
  // intentionally View-only on the HR-owned people modules (Employee/Attendance/
  // Payroll/Leave/Recruitment) and on the Technical-Head modules.
  for (const m of [
    'sales_reports', 'orders', 'seller_management', 'farmer_management',
    'consumer_management', 'role_permission_management', 'user_management',
    'system_configuration', 'returns_refunds', 'settlement_sellers',
  ]) {
    const a = cell('admin', m).actions;
    assert.ok(a.includes('edit') && a.includes('delete') && a.includes('approve'), `admin should fully control ${m}`);
  }
  for (const m of ['employee_management', 'payroll', 'api_integrations', 'backup_security', 'dashboard']) {
    assert.deepEqual(cell('admin', m).actions, ['view'], `admin should be view-only on ${m}`);
  }
});

test('separation of duties: managers cannot touch user or role management', () => {
  for (const role of [
    'district_manager',
    'regional_manager',
    'zonal_manager',
    'hub_manager',
    'hub_incharge',
  ]) {
    assert.equal(actions(role, 'user_management'), '', `${role} user_management`);
    assert.equal(actions(role, 'role_permission_management'), '', `${role} role mgmt`);
  }
});

test('Technical Head owns system/API/security but not finances', () => {
  assert.ok(cell('technical_head', 'system_configuration').actions.includes('edit'));
  assert.ok(cell('technical_head', 'api_integrations').actions.includes('edit'));
  assert.equal(actions('technical_head', 'financial_reports'), '');
  assert.equal(actions('technical_head', 'profit_loss'), '');
});

test('HR owns Employee Management scoped to employees, no operations', () => {
  assert.ok(cell('hr', 'employee_management').actions.includes('delete'));
  assert.equal(scope('hr', 'user_management'), 'employees');
  assert.equal(actions('hr', 'orders'), '');
});

test('Delivery Agent is scoped to assigned rows only', () => {
  assert.equal(scope('delivery_agent', 'orders'), 'assigned');
  assert.equal(actions('delivery_agent', 'orders'), 'edit,view');
  assert.equal(actions('delivery_agent', 'company_analytics'), '');
});

test('hub creation is Admin-only; managers still edit/assign hubs', () => {
  // Only the Admin team may CREATE a hub. POST /hubs is guarded on
  // hub_management:create, so this is what makes that endpoint admin-only.
  assert.ok(cell('admin', 'hub_management').actions.includes('create'));
  for (const role of ['state_head', 'zonal_manager', 'regional_manager', 'district_manager', 'hub_manager']) {
    assert.ok(!cell(role, 'hub_management').actions.includes('create'), `${role} must NOT create hubs`);
    // …but they keep the operational reach: edit a hub, assign its staff.
    assert.ok(cell(role, 'hub_management').actions.includes('edit'), `${role} should still edit hubs`);
    assert.ok(cell(role, 'hub_management').actions.includes('assign'), `${role} should still assign hub staff`);
  }
});

test('State Head = Zonal Manager plus Settlement approval', () => {
  for (const m of rbac.MODULE_KEYS) {
    if (m === 'settlement_sellers') continue;
    assert.equal(actions('state_head', m), actions('zonal_manager', m), `state vs zonal: ${m}`);
  }
  assert.ok(cell('state_head', 'settlement_sellers').actions.includes('approve'));
  assert.ok(!cell('zonal_manager', 'settlement_sellers').actions.includes('approve'));
});

test('the tiered managers + admin + the Category Manager can approve product listings', () => {
  // Category Manager owns the catalogue (product_approval full), so it is a product
  // approver alongside the operational tiers. No one else outside this set is.
  const approvers = rbac.ROLE_KEYS.filter((r) => cell(r, 'product_approval').actions.includes('approve'));
  assert.deepEqual(
    approvers.sort(),
    ['admin', 'category', 'district_manager', 'hub_manager', 'hub_incharge', 'regional_manager', 'state_head', 'zonal_manager'].sort()
  );
});

test('functional specialists are least-privilege: each owns its domain, nothing else', () => {
  // Finance runs the money modules end-to-end but never touches people, catalogue
  // or role administration.
  for (const m of ['payments', 'settlement_sellers', 'financial_reports', 'profit_loss']) {
    assert.ok(cell('finance', m).actions.includes('edit'), `finance should operate ${m}`);
  }
  for (const m of ['user_management', 'role_permission_management', 'product_approval', 'employee_management', 'system_configuration']) {
    assert.equal(actions('finance', m), '', `finance must not touch ${m}`);
  }

  // Support owns the customer desk (close complaints) and can respond to customers,
  // but has no money, catalogue or people reach.
  assert.ok(cell('support', 'customer_complaints').actions.includes('approve'), 'support should close complaints');
  assert.equal(actions('support', 'consumer_management'), 'edit,view');
  for (const m of ['payments', 'settlement_sellers', 'product_approval', 'user_management', 'role_permission_management']) {
    assert.equal(actions('support', m), '', `support must not touch ${m}`);
  }

  // Category owns the catalogue (full) but no money or role administration.
  assert.ok(cell('category', 'product_approval').actions.includes('delete'), 'category should fully manage the catalogue');
  for (const m of ['payments', 'settlement_sellers', 'user_management', 'role_permission_management', 'system_configuration']) {
    assert.equal(actions('category', m), '', `category must not touch ${m}`);
  }
});

test('legacy admin_role → role map covers every seeded designation', () => {
  for (const roleKey of Object.values(rbac.ADMIN_ROLE_TO_ROLE)) {
    assert.ok(rbac.ROLE_KEYS.includes(roleKey), `${roleKey} is a real role`);
  }
  // The consolidation the design conversation approved.
  assert.equal(rbac.ADMIN_ROLE_TO_ROLE['Head Office'], 'admin');
  assert.equal(rbac.ADMIN_ROLE_TO_ROLE['CTO'], 'technical_head');
  assert.equal(rbac.ADMIN_ROLE_TO_ROLE['CEO'], 'board_of_directors');
  assert.equal(rbac.ADMIN_ROLE_TO_ROLE['HR Manager'], 'hr');
});

test('expandCell rejects an unknown token', () => {
  assert.throws(() => rbac.expandCell('bogus', 'all'), /Unknown RBAC cell token/);
});
