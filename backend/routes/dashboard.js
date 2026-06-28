const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── GET /dashboard  (admin only, role-tiered KPIs) ───────────────────────────
router.get('/', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can access the dashboard.' });
  }

  const u = req.user;
  const adminRole = u.admin_role;

  // Build scope filter for orders
  let orderFilter = {};
  if (adminRole === 'VCO') {
    orderFilter = { village: u.vco_city };
  } else if (['District Manager', 'Hub Incharge'].includes(adminRole)) {
    orderFilter = { district: u.district_assign || u.district };
  } else if (adminRole === 'Delivery Agent') {
    orderFilter = { agent_id: u.id };
  }
  // Head Office / State Head / Regional Manager → no filter (all orders)

  // ── Fetch orders in scope ─────────────────────────────────────────────────
  let ordersQuery = supabase
    .from('orders')
    .select('id, total, market_fee, status, cancelled, district, village, created_at');

  for (const [col, val] of Object.entries(orderFilter)) {
    ordersQuery = ordersQuery.eq(col, val);
  }

  const { data: orders, error: ordersErr } = await ordersQuery;
  if (ordersErr) return res.status(500).json({ error: 'Could not load dashboard data.' });

  const activeOrders    = orders.filter(o => !o.cancelled);
  const deliveredOrders = orders.filter(o => o.status === 'Delivered');
  const cancelledOrders = orders.filter(o => o.cancelled);

  const gmv         = activeOrders.reduce((s, o) => s + o.total, 0);
  const platformFee = activeOrders.reduce((s, o) => s + o.market_fee, 0);

  // ── 7-day daily trend (IST date, computed from fetched orders) ─────────────
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayBuckets = {};
  const today = new Date(Date.now() + 5.5 * 3600000); // IST
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dayBuckets[key] = { date: key, day_label: DAY_LABELS[d.getDay()], order_count: 0, revenue: 0 };
  }
  activeOrders.forEach(o => {
    // Adjust stored UTC timestamp to IST before extracting date
    const istDate = new Date(new Date(o.created_at).getTime() + 5.5 * 3600000)
      .toISOString().slice(0, 10);
    if (dayBuckets[istDate]) {
      dayBuckets[istDate].order_count++;
      dayBuckets[istDate].revenue += o.total; // paise; middleware converts
    }
  });
  const daily_trend = Object.values(dayBuckets);

  // ── Top products by order count ───────────────────────────────────────────
  let topProducts = [];
  if (activeOrders.length > 0) {
    const orderIds = activeOrders.map(o => o.id);
    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, qty, subtotal, product:products(name, unit)')
      .in('order_id', orderIds);

    const prodMap = {};
    (items || []).forEach(item => {
      const pid  = item.product_id;
      const name = item.product?.name || 'Unknown';
      const unit = item.product?.unit || '';
      if (!prodMap[pid]) prodMap[pid] = { name, unit, qty: 0, revenue: 0 };
      prodMap[pid].qty     += parseFloat(item.qty    || 0);
      prodMap[pid].revenue += parseFloat(item.subtotal || 0);
    });
    topProducts = Object.entries(prodMap)
      .map(([id, v]) => ({ product_id: id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }

  // ── Farmers in scope ──────────────────────────────────────────────────────
  let farmersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'farmer');
  if (orderFilter.district) farmersQuery = farmersQuery.eq('district', orderFilter.district);
  if (orderFilter.village)  farmersQuery = farmersQuery.eq('village_town', orderFilter.village);
  const { count: farmerCount } = await farmersQuery;

  // ── Consumers in scope ───────────────────────────────────────────────────
  let consumersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'consumer');
  if (orderFilter.district) consumersQuery = consumersQuery.eq('district', orderFilter.district);
  if (orderFilter.village)  consumersQuery = consumersQuery.eq('village_town', orderFilter.village);
  const { count: consumerCount } = await consumersQuery;

  // ── Subscription summary (sellers only) ──────────────────────────────────
  let subQuery = supabase
    .from('users')
    .select('subscription_plan, subscription_expires_at, status')
    .eq('role', 'farmer')
    .not('subscription_expires_at', 'is', null);
  if (orderFilter.district) subQuery = subQuery.eq('district', orderFilter.district);
  const { data: subUsers } = await subQuery;

  const now = new Date();
  const subSummary = { active: 0, expiring_soon: 0, expired: 0, by_plan: {} };
  (subUsers || []).forEach(u => {
    const exp  = new Date(u.subscription_expires_at);
    const days = Math.ceil((exp - now) / 86400000);
    if (days <= 0) {
      subSummary.expired++;
    } else if (days <= 10) {
      subSummary.expiring_soon++;
      subSummary.active++;
    } else {
      subSummary.active++;
    }
    if (u.subscription_plan) {
      subSummary.by_plan[u.subscription_plan] = (subSummary.by_plan[u.subscription_plan] || 0) + 1;
    }
  });

  // ── Returns in scope ──────────────────────────────────────────────────────
  const orderIds = orders.map(o => o.id);
  let returnCount = 0;
  if (orderIds.length > 0) {
    const { count } = await supabase
      .from('returns')
      .select('id', { count: 'exact', head: true })
      .in('order_id', orderIds);
    returnCount = count || 0;
  }

  // ── Orders by status breakdown ────────────────────────────────────────────
  const statusBreakdown = orders.reduce((acc, o) => {
    const key = o.cancelled ? 'Cancelled' : o.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.json({
    scope: adminRole,
    kpis: {
      total_orders:     orders.length,
      active_orders:    activeOrders.length,
      delivered_orders: deliveredOrders.length,
      cancelled_orders: cancelledOrders.length,
      gmv_rupees:       (gmv / 100).toFixed(2),
      platform_fee_rupees: (platformFee / 100).toFixed(2),
      total_farmers:    farmerCount || 0,
      total_consumers:  consumerCount || 0,
      total_returns:    returnCount,
    },
    status_breakdown: statusBreakdown,
    daily_trend,
    top_products: topProducts,
    subscription_summary: subSummary,
  });
});

module.exports = router;
