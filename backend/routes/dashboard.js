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
  });
});

module.exports = router;
