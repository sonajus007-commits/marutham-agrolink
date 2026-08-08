// Mounts one route module in an Express app that matches production, with the
// supabase client replaced by a fake.
//
// HOW THE INJECTION WORKS. Routes do `const supabase = require('../db/supabase')`
// at module load, and that module builds a real client from env vars — requiring a
// route with no SUPABASE_URL set throws "supabaseUrl is required" before a single
// test runs. So the fake is written into require.cache under the real module's
// resolved path BEFORE the route is required. CommonJS then hands the route our
// object and never touches the network.
//
// The auth middleware and the notifier are stubbed for the same reason: the first
// would go to the database to load req.user, and the second would send real email.
// Both have their own tests; a route test should be about the route.
//
// The app is assembled exactly as server.js assembles it — including the res.json
// wrapper that converts paise to rupees and UTC to IST. Without it, tests would
// assert on a response shape that production never sends.

const path = require('path');
const express = require('express');
const { convertTimestamps } = require('../../utils/time');
const { convertMoney } = require('../../utils/money');
const rbac = require('../../config/rbac');

const SUPABASE_MODULE = path.join(__dirname, '..', '..', 'db', 'supabase.js');
const AUTH_MODULE     = path.join(__dirname, '..', '..', 'middleware', 'auth.js');
const PERMS_MODULE    = path.join(__dirname, '..', '..', 'middleware', 'permissions.js');
const NOTIFY_MODULE   = path.join(__dirname, '..', '..', 'utils', 'notify.js');

// The RBAC permission map, resolved once from config/rbac.js. In tests the rbac_*
// tables aren't in the fake DB, so middleware/permissions.js is stubbed with an
// in-memory version that DERIVES a user's permissions from their role — using
// user.role_key if present, else mapping the legacy admin_role. This keeps every
// existing route test (which sets `user: { role, admin_role }`) working unchanged,
// while enforcing exactly the same matrix the production tables are seeded from.
const RESOLVED = rbac.resolveMatrix();

function permsForUser(user) {
  const map = {};
  if (!user) return map;
  const roleKey = user.role_key || rbac.ADMIN_ROLE_TO_ROLE[user.admin_role] || null;
  const add = (rk) => {
    for (const r of RESOLVED) {
      if (r.roleKey !== rk) continue;
      const cur = map[r.moduleKey] || (map[r.moduleKey] = { actions: [], scope: 'none' });
      for (const a of r.actions) if (!cur.actions.includes(a)) cur.actions.push(a);
      if (r.scope !== 'none') cur.scope = r.scope;
    }
  };
  if (roleKey) add(roleKey);
  if (user.is_board_director) add('board_of_directors');
  if (user.is_hr_admin) add('hr');
  // A VCO flagged can_deliver unions the Delivery Agent role — mirrors the
  // additive grant in middleware/permissions.js so route tests see the same shape.
  if (user.can_deliver && roleKey !== 'delivery_agent') add('delivery_agent');
  return map;
}

function makeCan(user) {
  return (u, module, action) => {
    const p = permsForUser(u || user)[module];
    return !!p && p.actions.includes(action);
  };
}

function stub(modulePath, exports) {
  require.cache[modulePath] = {
    id: modulePath, filename: modulePath, path: path.dirname(modulePath),
    loaded: true, children: [], paths: [], exports,
  };
}

/** Every notifier call becomes a no-op that resolves. Nothing leaves the process. */
const silentNotifier = new Proxy({}, {
  get: () => async () => undefined,
  has: () => true,
});

/**
 * @param {string} routeModule  e.g. 'orders' → backend/routes/orders.js
 * @param {object} opts
 * @param {object} opts.supabase  a fakeSupabase()
 * @param {object|null} opts.user the signed-in user requireAuth would have loaded
 * @returns {{ url: string, close: () => Promise<void>, request: Function }}
 */
async function mountRoute(routeModule, { supabase, user = null }) {
  const routePath = path.join(__dirname, '..', '..', 'routes', `${routeModule}.js`);

  // Anything that closes over the fake must be re-required, not reused from a
  // previous test's cache. Purge the route and everything it reaches that touches
  // the client.
  for (const p of [routePath, SUPABASE_MODULE, AUTH_MODULE, PERMS_MODULE, NOTIFY_MODULE,
                   path.join(__dirname, '..', '..', 'utils', 'employeeValidation.js')]) {
    delete require.cache[p];
  }

  stub(SUPABASE_MODULE, supabase);
  stub(NOTIFY_MODULE, silentNotifier);

  // Permission model, derived in-memory from the signed-in user (see permsForUser).
  const can = makeCan(user);
  const scopeFor = (u, module) => {
    const p = permsForUser(u || user)[module];
    return (p && p.scope) || 'none';
  };
  const attachUser = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = { ...user, permissions: permsForUser(user), role_key: user.role_key || rbac.ADMIN_ROLE_TO_ROLE[user.admin_role] || null };
    next();
  };
  stub(PERMS_MODULE, {
    can,
    scopeFor,
    requirePermission: (module, action) => [
      attachUser,
      (req, res, next) => {
        if (can(req.user, module, action)) return next();
        return res.status(403).json({ error: `Access denied. Need '${action}' on ${module}.` });
      },
    ],
    resolveUserPermissions: async (u) => permsForUser(u),
    roleKeyFor: async () => (user ? (user.role_key || rbac.ADMIN_ROLE_TO_ROLE[user.admin_role] || null) : null),
    roleIdForAdminRole: async () => null,
    permissionPayload: async (u) => ({
      role_key: u ? (u.role_key || rbac.ADMIN_ROLE_TO_ROLE[u.admin_role] || null) : null,
      permissions: permsForUser(u),
      dashboards: {},
    }),
    dashboardsFor: () => ({}),
    invalidatePermissionCache: () => {},
  });

  // A faithful-enough auth: attaches the user, enforces the role. The REAL
  // middleware is tested separately, against the fake, in auth.middleware.test.js.
  const attach = (req, res, next) => {
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = { ...user };
    next();
  };
  stub(AUTH_MODULE, {
    requireAuth: attach,
    optionalAuth: (req, res, next) => { if (user) req.user = { ...user }; next(); },
    requireRole: (...roles) => (req, res, next) => {
      if (!user) return res.status(401).json({ error: 'Authentication required.' });
      req.user = { ...user };
      if (!roles.includes(user.role)) return res.status(403).json({ error: 'Forbidden.' });
      next();
    },
  });

  const router = require(routePath);

  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {                       // as server.js does
    const originalJson = res.json.bind(res);
    res.json = (data) => originalJson(convertMoney(convertTimestamps(data)));
    next();
  });
  app.use('/', router);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = `http://127.0.0.1:${server.address().port}`;

  async function request(method, p, body) {
    const res = await fetch(url + p, {
      method,
      headers: { 'content-type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: res.status, body: json, text };
  }

  return {
    url,
    request,
    get:   (p)       => request('GET', p),
    post:  (p, body) => request('POST', p, body),
    patch: (p, body) => request('PATCH', p, body),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** Silence the console.error calls the routes make on purpose, so test output stays readable. */
function muteConsoleError() {
  const original = console.error;
  const lines = [];
  console.error = (...args) => lines.push(args.map(String).join(' '));
  return { lines, restore: () => { console.error = original; } };
}

module.exports = { mountRoute, muteConsoleError };
