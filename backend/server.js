require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { convertTimestamps } = require('./utils/time');
const { convertMoney } = require('./utils/money');

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

app.use('/auth',      authRouter);
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

// /me lives under /auth but the spec exposes it at /me — alias both
app.get('/me',   require('./middleware/auth').requireAuth, (req, res) => res.redirect(307, '/auth/me'));
app.patch('/me', require('./middleware/auth').requireAuth, (req, res) => res.redirect(307, '/auth/me'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Marutham API listening on port ${PORT}`));
