const express = require('express');
const supabase = require('../db/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// ── GET /farmers  ─────────────────────────────────────────────────────────────
// Returns farmers in the admin's scope with aggregated performance stats.
// Stats: listing_count, delivered_orders, total_revenue, avg_rating
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    const u = req.user;

    // Step 1: Fetch farmers scoped by admin role
    let farmerQuery = supabase
      .from('users')
      .select('id, fname, lname, phone, village_town, district, state, status, bank_name, created_at')
      .eq('role', 'farmer')
      .order('fname', { ascending: true });

    const districtRoles = new Set(['District Manager', 'VCO', 'Delivery Agent', 'Hub Incharge']);
    const regionRoles   = new Set(['Regional Manager']);
    if (districtRoles.has(u.admin_role)) farmerQuery = farmerQuery.eq('district', u.district);
    else if (regionRoles.has(u.admin_role)) farmerQuery = farmerQuery.eq('state', u.state);
    // State Head / Head Office see all farmers

    const { data: farmers, error: ferr } = await farmerQuery;
    if (ferr) return res.status(500).json({ error: ferr.message });
    if (!farmers || farmers.length === 0) return res.json({ farmers: [] });

    const farmerIds = farmers.map(f => f.id);

    // Step 2: Parallel fetch of stats
    const [listingsRes, orderItemsRes, ratingsRes] = await Promise.all([
      // Count active listings per farmer
      supabase
        .from('farmer_listings')
        .select('farmer_id, id, listed')
        .in('farmer_id', farmerIds),

      // Revenue: delivered order items for these farmers
      supabase
        .from('order_items')
        .select('farmer_id, farmer_price, qty, order_id')
        .in('farmer_id', farmerIds),

      // Ratings per farmer
      supabase
        .from('product_ratings')
        .select('farmer_id, sum_stars, num_ratings')
        .in('farmer_id', farmerIds),
    ]);

    // Filter order_items to delivered orders only
    let deliveredOrderIds = new Set();
    if (orderItemsRes.data && orderItemsRes.data.length > 0) {
      const allOrderIds = [...new Set(orderItemsRes.data.map(i => i.order_id))];
      if (allOrderIds.length > 0) {
        const { data: deliveredOrders } = await supabase
          .from('orders')
          .select('id')
          .in('id', allOrderIds)
          .eq('status', 'Delivered');
        deliveredOrderIds = new Set((deliveredOrders || []).map(o => o.id));
      }
    }

    // Build lookup maps
    const listingMap  = {};
    const revenueMap  = {};
    const orderMap    = {};
    const ratingMap   = {};

    (listingsRes.data || []).forEach(l => {
      if (!listingMap[l.farmer_id]) listingMap[l.farmer_id] = { total: 0, active: 0 };
      listingMap[l.farmer_id].total++;
      if (l.listed) listingMap[l.farmer_id].active++;
    });

    (orderItemsRes.data || []).forEach(item => {
      if (!deliveredOrderIds.has(item.order_id)) return;
      const fid = item.farmer_id;
      if (!revenueMap[fid]) revenueMap[fid] = 0;
      if (!orderMap[fid])   orderMap[fid]   = new Set();
      revenueMap[fid] += (parseFloat(item.farmer_price || 0) * parseFloat(item.qty || 1));
      orderMap[fid].add(item.order_id);
    });

    (ratingsRes.data || []).forEach(r => {
      const fid = r.farmer_id;
      if (!ratingMap[fid]) ratingMap[fid] = { sum: 0, count: 0 };
      ratingMap[fid].sum   += r.sum_stars;
      ratingMap[fid].count += r.num_ratings;
    });

    // Merge stats onto farmers
    const result = farmers.map(f => ({
      ...f,
      listing_count:    (listingMap[f.id]  || {}).total    || 0,
      active_listings:  (listingMap[f.id]  || {}).active   || 0,
      delivered_orders: orderMap[f.id] ? orderMap[f.id].size : 0,
      total_revenue:    Math.round(revenueMap[f.id] || 0),  // still in paise; middleware converts
      avg_rating:       ratingMap[f.id] && ratingMap[f.id].count > 0
                          ? (ratingMap[f.id].sum / ratingMap[f.id].count).toFixed(1)
                          : null,
      num_ratings:      ratingMap[f.id] ? ratingMap[f.id].count : 0,
    }));

    res.json({ farmers: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /farmers/:id/activity ─────────────────────────────────────────────────
// Revenue line-items, fulfilled orders, and reviews for the stat-detail pane.
router.get('/:id/activity', requireRole('admin'), async (req, res) => {
  try {
    const id = req.params.id;

    const { data: items, error: iErr } = await supabase
      .from('order_items')
      .select('order_id, name, qty, unit, farmer_price, rated, rating_value, rated_at')
      .eq('farmer_id', id);
    if (iErr) return res.status(500).json({ error: iErr.message });

    const orderIds = [...new Set((items || []).map(i => i.order_id))];
    const ordersById = {};
    if (orderIds.length) {
      const { data: ords } = await supabase
        .from('orders')
        .select('id, code, created_at, status')
        .in('id', orderIds);
      (ords || []).forEach(o => { ordersById[o.id] = o; });
    }

    // Revenue = delivered line-items only (matches the headline Revenue stat).
    const revItems = [];
    const orderMap = {};
    (items || []).forEach(it => {
      const o = ordersById[it.order_id];
      if (!o || o.status !== 'Delivered') return;
      const linePaise = Math.round(parseFloat(it.farmer_price || 0) * parseFloat(it.qty || 1));
      revItems.push({
        order_code: o.code, created_at: o.created_at,
        name: it.name, qty: it.qty, unit: it.unit, amount: linePaise,
      });
      if (!orderMap[o.id]) orderMap[o.id] = { code: o.code, created_at: o.created_at, amount: 0 };
      orderMap[o.id].amount += linePaise;
    });
    revItems.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const orders = Object.values(orderMap).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const ratings = (items || [])
      .filter(it => it.rated && it.rating_value)
      .map(it => ({ name: it.name, rating_value: it.rating_value, rated_at: it.rated_at }))
      .sort((a, b) => new Date(b.rated_at) - new Date(a.rated_at));

    res.json({ items: revItems, orders, ratings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /farmers/:id/block ──────────────────────────────────────────────────
router.patch('/:id/block', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .update({ status: 'blocked', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .select('id, fname')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Farmer blocked.', user: data });
});

// ── PATCH /farmers/:id/unblock ────────────────────────────────────────────────
router.patch('/:id/unblock', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .select('id, fname')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'Farmer unblocked.', user: data });
});

module.exports = router;
