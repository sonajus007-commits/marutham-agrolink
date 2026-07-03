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

app.use('/auth',          authRouter);
app.use('/products',  productsRouter);
app.use('/listings',  listingsRouter);
app.use('/orders',    ordersRouter);
app.use('/orders',    deliveryRouter);
app.use('/orders',    ratingsRouter);
app.use('/orders',    returnsRouter);
app.use('/ratings',   ratingsRouter);
app.use('/returns',   returnsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/payouts',   payoutsRouter);
app.use('/users',     usersRouter);
app.use('/farmers',   farmersRouter);
app.use('/consumers', consumersRouter);
app.use('/config',        configRouter);
app.use('/registrations', registrationsRouter);
app.use('/subscription',  subscriptionRouter);
app.use('/locations',     locationsRouter);

// /me lives under /auth but the spec exposes it at /me — alias both
app.get('/me',   require('./middleware/auth').requireAuth, (req, res) => res.redirect(307, '/auth/me'));
app.patch('/me', require('./middleware/auth').requireAuth, (req, res) => res.redirect(307, '/auth/me'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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
