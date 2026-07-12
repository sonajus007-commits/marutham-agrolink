require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const { convertTimestamps } = require('./utils/time');
const { convertMoney } = require('./utils/money');
const supabase  = require('./db/supabase');
const notify    = require('./utils/notify');
const { syncPrices } = require('./utils/priceSync');

const app = express();
app.use(cors());
app.use(express.json());

// Format all API responses:
//   • Timestamps: UTC (DB) → IST UTC+5:30 (user-facing)
//   • Money: paise integers (DB) → Rupees with 2 decimal places (user-facing)
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => originalJson(convertMoney(convertTimestamps(data)));
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
const authRouter     = require('./routes/auth');
const productsRouter = require('./routes/products');
const listingsRouter = require('./routes/listings');
const ordersRouter    = require('./routes/orders');
const deliveryRouter  = require('./routes/delivery');
const ratingsRouter   = require('./routes/ratings');
const returnsRouter   = require('./routes/returns');
const dashboardRouter = require('./routes/dashboard');
const payoutsRouter   = require('./routes/payouts');
const usersRouter     = require('./routes/users');
const farmersRouter   = require('./routes/farmers');
const consumersRouter = require('./routes/consumers');
const configRouter        = require('./routes/config');
const registrationsRouter = require('./routes/registrations');
const subscriptionRouter  = require('./routes/subscription');
const locationsRouter     = require('./routes/locations');
const employeesRouter     = require('./routes/employees');

// The whole API lives under /api. It used to own the ROOT namespace (/products,
// /orders, /users …), which made the root unusable for anything else: a public
// product page at /products/tomatoes could never render, because the API
// answered there first, with JSON. The root is the marketplace's SEO surface and
// is worth more to the business than a short API path, so the API moved and the
// shop (apps/shop) now owns / — see docs/adr-001-frontend-framework.md.
//
// This was a breaking change for every client, which was affordable exactly once:
// nothing hardcodes API paths (every caller goes through a single API_BASE) and
// there is no production deployment. It gets more expensive with every client
// added, so it was done before the marketplace shipped rather than after.
const api = express.Router();

api.use('/auth',          authRouter);
api.use('/products',  productsRouter);
api.use('/listings',  listingsRouter);
api.use('/orders',    ordersRouter);
api.use('/orders',    deliveryRouter);
api.use('/orders',    ratingsRouter);
api.use('/orders',    returnsRouter);
api.use('/ratings',   ratingsRouter);
api.use('/returns',   returnsRouter);
api.use('/dashboard', dashboardRouter);
api.use('/payouts',   payoutsRouter);
api.use('/users',     usersRouter);
api.use('/farmers',   farmersRouter);
api.use('/consumers', consumersRouter);
api.use('/config',        configRouter);
api.use('/registrations', registrationsRouter);
api.use('/subscription',  subscriptionRouter);
api.use('/locations',     locationsRouter);
api.use('/employees',     employeesRouter);

// /me lives under /auth but the spec exposes it at /me — alias both
api.get('/me',   require('./middleware/auth').requireAuth, (req, res) => res.redirect(307, '/api/auth/me'));
api.patch('/me', require('./middleware/auth').requireAuth, (req, res) => res.redirect(307, '/api/auth/me'));

// Mounted ahead of the shop proxy and the static site: /api is unambiguous and
// must never be reachable by anything else.
app.use('/api', api);

// An API path that no longer exists is a client that was never migrated. Say so
// loudly rather than letting it fall through to the static handler, which would
// answer a stale GET /products with the homepage's HTML and turn a one-line fix
// into a confusing JSON-parse error.
const API_SEGMENTS = [
  'auth', 'products', 'listings', 'orders', 'ratings', 'returns', 'dashboard',
  'payouts', 'users', 'farmers', 'consumers', 'config', 'registrations',
  'subscription', 'locations', 'employees', 'me',
];
app.use(`/:segment(${API_SEGMENTS.join('|')})`, (req, res, next) => {
  // The shop owns /products/* as PAGES. Only shout when the caller clearly wanted
  // the API: no browser navigation asks for JSON.
  if (req.accepts(['html', 'json']) === 'html') return next();
  res.status(404).json({
    error: `The API moved to /api. Use /api${req.baseUrl}${req.path === '/' ? '' : req.path}.`,
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── New React app (Phase 0) — served under /app, alongside the legacy site ────
// Purely additive: if apps/web/dist doesn't exist yet, /app simply 404s and the
// legacy frontend below is unaffected.
const appDist = path.join(__dirname, '../apps/web/dist');
app.use('/app', express.static(appDist));
app.get('/app/*', (_req, res) => res.sendFile(path.join(appDist, 'index.html')));

// ── Public marketplace (apps/shop, Next.js) — proxied at the site root ────────
//
// Express stays the SINGLE FRONT DOOR. The browser only ever talks to this
// origin; the shop's server-rendered routes are forwarded to Next (:3001).
//
// That is a requirement, not a preference: the cart (`ma_cart`) and the session
// (`ma_token`) live in origin-scoped localStorage, so a visitor who taps a
// product on the shop and signs in at /app must arrive still holding it. Serve
// the shop from another host and that hand-off silently breaks at the exact
// moment of highest intent.
//
// Additive and reversible, exactly like the /app mount above: with SHOP_URL
// unset — or with the Next server simply not running — every one of these routes
// falls through to the legacy static site below, which still answers on
// home.html. The shop can never take the existing site down with it.
const SHOP_URL = process.env.SHOP_URL; // e.g. http://localhost:3001

/** The paths the shop owns.
 *
 * An ALLOW-LIST, deliberately. The API has moved to /api, so the root namespace
 * is free — but "free" is not the same as "the shop's". The legacy static site
 * still answers here (home.html, /css, /js, every *.html page the strangler-fig
 * has not replaced yet), so a deny-list — "anything that isn't /api or /app" —
 * would hand the shop URLs it has no page for and 404 the legacy site.
 *
 * Each slice adds the routes it actually implements. That keeps the shop
 * reversible: delete a line and the old page answers again.
 */
function isShopPath(pathname) {
  return (
    pathname === '/' ||
    pathname.startsWith('/_next/') ||
    pathname === '/products' ||
    pathname.startsWith('/products/')
  );
}

if (SHOP_URL) {
  const { createProxyMiddleware } = require('http-proxy-middleware');
  // Mounted app-wide with a filter, NOT as app.use('/_next', proxy): a prefix
  // mount STRIPS the prefix from req.url, so Next would be asked for /static/…
  // instead of /_next/static/…, every asset would 404, and the page would render
  // unstyled and never hydrate — its buttons silently doing nothing.
  app.use(
    createProxyMiddleware({
      target: SHOP_URL,
      changeOrigin: false, // the same-origin illusion is the whole point
      xfwd: true,
      pathFilter: (pathname) => isShopPath(pathname),
      // A dead shop must not take the site down.
      //
      // http-proxy-middleware v3 hands the error callback (err, req, res, target)
      // — there is NO `next`, so this cannot fall through to the static handler
      // below. It serves the legacy homepage itself instead: the root keeps
      // answering with a real page even when Next is down. Assets get a plain 502
      // (an HTML page is not a substitute for a stylesheet).
      on: {
        error: (err, req, res) => {
          console.error('[shop proxy]', err.message);
          if (!res || res.headersSent) return;
          if (req.path === '/') {
            return res.sendFile(path.join(__dirname, '../frontend/home.html'));
          }
          res.status(502).end();
        },
      },
    }),
  );
  console.log(`[shop] proxying / and /_next/* → ${SHOP_URL}`);
}

// ── Frontend (served from same origin — works in dev and production) ──────────
app.use(express.static(path.join(__dirname, '../frontend'), { index: 'home.html' }));

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Marutham API listening on port ${PORT}`);
  scheduleSubscriptionChecks();
  schedulePriceSync();
  scheduleListingReset();
});

// ── Daily subscription expiry checker ─────────────────────────────────────────
function scheduleSubscriptionChecks() {
  const REMINDER_DAYS = [10, 5, 1];
  const MS_PER_DAY    = 24 * 60 * 60 * 1000;

  async function runCheck() {
    try {
      const now = new Date();

      // Find all active farmers/retailers
      const { data: users } = await supabase
        .from('users')
        .select('id, fname, lname, email, login_id, role, status, subscription_expires_at')
        .eq('role', 'farmer')
        .in('status', ['active'])
        .not('subscription_expires_at', 'is', null);

      if (!users || users.length === 0) return;

      for (const user of users) {
        const expiry   = new Date(user.subscription_expires_at);
        const diffMs   = expiry - now;
        const diffDays = Math.ceil(diffMs / MS_PER_DAY);

        if (diffDays <= 0) {
          // Expired — block and notify
          await supabase.from('users').update({ status: 'blocked' }).eq('id', user.id);
          try { await notify.notifySubscriptionExpired(user); } catch(e) { console.error('Notify expired error:', e.message); }
          console.log(`[SUBSCRIPTION] Blocked expired user ${user.login_id}`);
        } else if (REMINDER_DAYS.includes(diffDays)) {
          // Reminder day — send reminder
          try { await notify.notifySubscriptionExpiring(user, diffDays); } catch(e) { console.error('Notify reminder error:', e.message); }
          console.log(`[SUBSCRIPTION] Reminder sent to ${user.login_id} — ${diffDays} day(s) left`);
        }
      }
    } catch (err) {
      console.error('[SUBSCRIPTION] Daily check error:', err.message);
    }
  }

  // Run once on startup (catches overnight expirations), then every 24 hours
  runCheck();
  setInterval(runCheck, MS_PER_DAY);
}

// ── Hourly listing reset — after cutoff, set listed=false, confirmed=false ─────
function scheduleListingReset() {
  const INTERVAL = 60 * 60 * 1000; // 1 hour

  async function runReset() {
    try {
      const now = new Date().toISOString();
      // Only reset active listings whose cutoff has passed and are still listed/confirmed
      const { data, error } = await supabase
        .from('farmer_listings')
        .select('id')
        .eq('listing_status', 'active')
        .lt('cutoff_ts', now)
        .or('confirmed.eq.true,listed.eq.true');

      if (error) { console.error('[LISTING RESET] Query error:', error.message); return; }
      if (!data || data.length === 0) return;

      const ids = data.map(r => r.id);
      const { error: upErr } = await supabase
        .from('farmer_listings')
        .update({ confirmed: false, listed: false })
        .in('id', ids);

      if (upErr) { console.error('[LISTING RESET] Update error:', upErr.message); return; }
      console.log(`[LISTING RESET] Reset ${ids.length} listing(s) — cutoff passed, listed=false confirmed=false`);
    } catch (err) {
      console.error('[LISTING RESET] Error:', err.message);
    }
  }

  runReset();
  setInterval(runReset, INTERVAL);
  console.log('[LISTING RESET] Hourly scheduler started');
}

// ── Daily government price sync ───────────────────────────────────────────────
function schedulePriceSync() {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function msUntil6amIST() {
    const now = new Date();
    // IST is UTC+5:30; 6 AM IST = 00:30 UTC
    const next = new Date(now);
    next.setUTCHours(0, 30, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next - now;
  }

  // Schedule first run at 6 AM IST, then every 24 hours
  setTimeout(function run() {
    syncPrices().catch(e => console.error('[PRICE SYNC] Scheduled run error:', e.message));
    setInterval(() => syncPrices().catch(e => console.error('[PRICE SYNC] Interval error:', e.message)), MS_PER_DAY);
  }, msUntil6amIST());

  const h = Math.round(msUntil6amIST() / 3600000);
  console.log(`[PRICE SYNC] Scheduled — first run in ~${h}h (6 AM IST daily)`);
}
