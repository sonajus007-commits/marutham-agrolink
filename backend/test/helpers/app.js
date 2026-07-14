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

const SUPABASE_MODULE = path.join(__dirname, '..', '..', 'db', 'supabase.js');
const AUTH_MODULE     = path.join(__dirname, '..', '..', 'middleware', 'auth.js');
const NOTIFY_MODULE   = path.join(__dirname, '..', '..', 'utils', 'notify.js');

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
  for (const p of [routePath, SUPABASE_MODULE, AUTH_MODULE, NOTIFY_MODULE,
                   path.join(__dirname, '..', '..', 'utils', 'employeeValidation.js')]) {
    delete require.cache[p];
  }

  stub(SUPABASE_MODULE, supabase);
  stub(NOTIFY_MODULE, silentNotifier);

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
