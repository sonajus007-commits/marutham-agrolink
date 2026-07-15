// Sentry FIRST — before express/routes load, so its instrumentation can patch them.
// A no-op unless SENTRY_DSN is set (see instrument.js).
const { Sentry, enabled: sentryEnabled } = require('./instrument');
require('dotenv').config();
const path    = require('path');
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const { convertTimestamps } = require('./utils/time');
const { convertMoney } = require('./utils/money');
const supabase  = require('./db/supabase');
const notify    = require('./utils/notify');
const { syncPrices } = require('./utils/priceSync');

const app = express();

// Behind a reverse proxy (the shop proxy, and whatever fronts the deploy), req.ip and
// the rate limiter's key come from X-Forwarded-For. Trust a FIXED number of hops, not
// `true`: trusting every hop lets a client forge X-Forwarded-For and sail past the
// limiter. Default 1 (one proxy); override TRUST_PROXY_HOPS per deployment.
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

// Security headers. CSP and COEP are deliberately OFF: this same server serves the
// static frontend (home.html + /img) AND proxies the Next.js shop, and a strict CSP
// would block their inline scripts and cross-origin chunks — a v1.0 stability risk not
// worth taking blind. What stays on is the high-value, low-risk set: X-Frame-Options
// (clickjacking), X-Content-Type-Options: nosniff (MIME sniffing), HSTS, and a sane
// referrer policy. A tuned CSP is a documented post-UAT hardening item.
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS. Pinned to an allowlist from CORS_ORIGINS (comma-separated) when set; falls back
// to open only when it is not, so a same-origin dev box still works. Set CORS_ORIGINS in
// any deployment that serves the API on a different origin than the frontend.
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors(corsOrigins.length ? { origin: corsOrigins, credentials: true } : {}));

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
const notificationsRouter = require('./routes/notifications');

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
api.use('/notifications', notificationsRouter);

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

// ── The React app — every signed-in screen, served under /app ────────────────
// The strangler-fig is COMPLETE: admin.html, farmer.html, consumer.html,
// agent.html and index.html (the old login) are gone, and this is the only place
// a user signs in or does any work. What remains under frontend/ is the public
// landing page and the two assets it and this app share — see the static mount
// at the bottom of this file.
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
// falls through to the static handler below, which still answers on home.html.
// The shop can never take the site down with it.
const SHOP_URL = process.env.SHOP_URL; // e.g. http://localhost:3001

/** The paths the shop owns.
 *
 * An ALLOW-LIST, deliberately. The API has moved to /api and the legacy pages are
 * gone, so the root namespace is nearly empty — but "empty" is not the same as
 * "the shop's". home.html still answers at /, and /img + /js/config.js are served
 * from the static mount below (the React app loads /img/logo-sm.jpg). A deny-list
 * — "anything that isn't /api or /app" — would hand those to the shop, which has
 * no page for them.
 *
 * Each slice adds the routes it actually implements. That keeps the shop
 * reversible: delete a line and the static handler answers again.
 */
function isShopPath(pathname) {
  return (
    pathname === '/' ||
    pathname.startsWith('/_next/') ||
    pathname === '/products' ||
    pathname.startsWith('/products/') ||
    // Next generates these (app/sitemap.ts, app/robots.ts). They are the shop's
    // whole reason for existing — a crawler that cannot fetch them will not find
    // the product pages — and without a line here they fall through to the
    // static site and 404.
    pathname === '/sitemap.xml' ||
    pathname === '/robots.txt'
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

// ── Static site (same origin — works in dev and production) ──────────────────
//
// All that is left of the pre-React frontend, and each file earns its place:
//
//   home.html      the public landing page. It answers at / when the Next shop is
//                  not running, and the shop proxy's error handler serves it by
//                  name (above) — so it is the site's outage floor. Deleting it
//                  means a dead root the moment Next hiccups.
//   img/           /img/logo-sm.jpg is loaded by FOUR React pages (admin, agent,
//                  consumer, farmer). This is not a legacy leftover; the app
//                  depends on it.
//   js/config.js   home.html's only script dependency. It sets API_BASE = '/api';
//                  without it home.html's fetch falls back to '' and asks for
//                  /products — which is the SHOP's route, not the API's, so the
//                  product grid would silently break.
//
// Everything else (index/admin/farmer/consumer/agent.html, shared.js, api.js,
// css/app.css, js/dashboard/*, js/vendor/*) was deleted when the React console
// took over. Do not add pages here — new screens belong in apps/web.
app.use(express.static(path.join(__dirname, '../frontend'), { index: 'home.html' }));

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

// Sentry's error handler goes AFTER the routes and BEFORE our own: it reports the
// error, then lets our handler below format the JSON 500 the client sees. Guarded by
// the DSN so it is never registered when Sentry is disabled.
if (sentryEnabled) Sentry.setupExpressErrorHandler(app);

// ── Error-handling middleware ───────────────────────────────────────────────────
// The 4-argument signature is what marks this as Express's error handler. It catches
// anything a route passes to next(err), and any SYNCHRONOUS throw inside a handler, and
// turns it into one JSON 500 instead of a default HTML stack trace. It does NOT catch a
// throw from an ASYNC handler — Express 4 cannot — which is why the async routes that
// await a thrower keep their own try/catch. This is the floor, not the whole story.
// eslint-disable-next-line no-unused-vars  (Express detects the handler by its arity)
app.use((err, _req, res, _next) => {
  console.error('[unhandled route error]', err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

// ── Process-level safety net ────────────────────────────────────────────────────
// The backstop for the async-throw class specifically. An unhandled rejection is
// Node's default trigger to KILL the process — one bad request has taken this whole API
// down before. We log it loudly and STAY UP: a single failed request must never be able
// to sign every other user out. This does not excuse missing try/catch (the client on
// that one request still gets no answer and times out) — it only stops the blast radius
// from being the entire server.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] a promise rejected with no catch — staying up:',
    reason && reason.stack ? reason.stack : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException] staying up:', err && err.stack ? err.stack : err);
});

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
      const { data: users, error: usersErr } = await supabase
        .from('users')
        .select('id, fname, lname, email, login_id, role, status, subscription_expires_at')
        .eq('role', 'farmer')
        .in('status', ['active'])
        .not('subscription_expires_at', 'is', null);

      // Unread, a failed read looked exactly like "no seller has a subscription", and
      // the whole nightly sweep quietly did nothing — night after night, with a clean
      // log and nobody expiring.
      if (usersErr) {
        console.error('[SUBSCRIPTION] Expiry sweep ABORTED — could not read sellers:', usersErr.message);
        return;
      }
      if (!users || users.length === 0) return;

      for (const user of users) {
        const expiry   = new Date(user.subscription_expires_at);
        const diffMs   = expiry - now;
        const diffDays = Math.ceil(diffMs / MS_PER_DAY);

        if (diffDays <= 0) {
          // Expired — block and notify. Unread, a failed update still printed
          // "Blocked expired user" and still emailed them to say so, while the account
          // stayed active. The log line was the only evidence anyone had, and it lied.
          const { error: blockErr } = await supabase.from('users').update({ status: 'blocked' }).eq('id', user.id);
          if (blockErr) {
            console.error(`[SUBSCRIPTION] FAILED to block expired user ${user.login_id} — they remain ACTIVE:`, blockErr.message);
          } else {
            try { await notify.notifySubscriptionExpired(user); } catch(e) { console.error('Notify expired error:', e.message); }
            console.log(`[SUBSCRIPTION] Blocked expired user ${user.login_id}`);
          }
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
