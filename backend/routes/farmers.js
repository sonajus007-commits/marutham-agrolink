const express = require('express');
const supabase = require('../db/supabase');
const { requirePermission } = require('../middleware/permissions');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Farmer PUBLIC profiles (consent-gated) ────────────────────────────────────
// A grower is anonymised on public pages by default (utils/publicShape.js). These
// routes serve ONLY farmers who opted in (public_profile = true, migration 050),
// and ONLY an allow-list of public-safe columns — never phone/email/bank/id-docs.
// No auth: this is what the public /farmers pages read.
const PUBLIC_FARMER_COLUMNS = 'id, fname, lname, village_town, district, public_bio, public_photo_url';

function shapePublicFarmer(f) {
  const name = [f.fname, f.lname].filter(Boolean).join(' ').trim();
  return {
    id: f.id,
    name: name || null,
    village: f.village_town || null,
    district: f.district || null,
    bio: f.public_bio || null,
    photo_url: f.public_photo_url || null,
  };
}

// GET /farmers/public — the consented farmer directory. Defined before any
// param route so "public" is never read as a farmer id.
router.get('/public', async (_req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select(PUBLIC_FARMER_COLUMNS)
    .eq('role', 'farmer')
    .eq('public_profile', true)
    .order('fname', { ascending: true });

  if (error) {
    console.error('GET /farmers/public error:', error.message);
    return res.status(500).json({ error: 'Could not load farmers.' });
  }
  res.json({ farmers: (data || []).map(shapePublicFarmer) });
});

// GET /farmers/public/:id — one consented farmer, or 404. An opted-out or unknown
// farmer is a real 404, never a leak.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.get('/public/:id', async (req, res) => {
  // A non-uuid id (e.g. a sample-story slug the shop probes first) is simply not
  // a farmer — 404, rather than letting Postgres reject the invalid uuid as a 500.
  if (!UUID_RE.test(req.params.id)) return res.status(404).json({ error: 'Farmer not found.' });

  const { data, error } = await supabase
    .from('users')
    .select(PUBLIC_FARMER_COLUMNS)
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .eq('public_profile', true)
    .maybeSingle();

  if (error) {
    console.error('GET /farmers/public/:id error:', error.message);
    return res.status(500).json({ error: 'Could not load farmer.' });
  }
  if (!data) return res.status(404).json({ error: 'Farmer not found.' });
  res.json({ farmer: shapePublicFarmer(data) });
});

// PATCH /farmers/me/public-profile — a farmer sets their own consent + bio/photo.
// This is the ONLY way public_profile flips on: the farmer chooses it.
router.patch('/me/public-profile', requireAuth, async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers have a public profile.' });
  }

  const update = {};
  if (typeof req.body.public_profile === 'boolean') update.public_profile = req.body.public_profile;

  if (req.body.public_bio !== undefined) {
    const bio = req.body.public_bio === null ? null : String(req.body.public_bio).trim();
    if (bio && bio.length > 600) {
      return res.status(400).json({ error: 'Your story must be 600 characters or fewer.' });
    }
    update.public_bio = bio || null;
  }

  if (req.body.public_photo_url !== undefined) {
    const url = req.body.public_photo_url === null ? null : String(req.body.public_photo_url).trim();
    // Only an https URL — never javascript:/data: schemes rendered into an <img>.
    if (url && !/^https:\/\/[^\s]{1,2048}$/.test(url)) {
      return res.status(400).json({ error: 'Photo must be an https URL.' });
    }
    update.public_photo_url = url || null;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'Nothing to update.' });
  }

  const { data, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', req.user.id)
    .select(PUBLIC_FARMER_COLUMNS + ', public_profile')
    .maybeSingle();

  if (error) {
    console.error('PATCH /farmers/me/public-profile error:', error.message);
    return res.status(500).json({ error: 'Could not update your profile.' });
  }
  res.json({ public_profile: data?.public_profile ?? false, farmer: data ? shapePublicFarmer(data) : null });
});

// ── GET /farmers  ─────────────────────────────────────────────────────────────
// Returns farmers in the admin's scope with aggregated performance stats.
// Stats: listing_count, delivered_orders, total_revenue, avg_rating
router.get('/', requirePermission('farmer_management','view'), async (req, res) => {
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
        const { data: deliveredOrders, error: deliveredErr } = await supabase
          .from('orders')
          .select('id')
          .in('id', allOrderIds)
          .eq('status', 'Delivered');
        // Revenue counts delivered lines only. An empty set here is not "nothing was
        // delivered" — it silently reports every seller as having earned nothing.
        if (deliveredErr) {
          console.error('GET /farmers delivered-order lookup failed:', deliveredErr.message);
          return res.status(500).json({ error: 'Could not load seller statistics. Please try again.' });
        }
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
router.get('/:id/activity', requirePermission('farmer_management','view'), async (req, res) => {
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
      const { data: ords, error: ordsErr } = await supabase
        .from('orders')
        .select('id, code, created_at, status')
        .in('id', orderIds);
      if (ordsErr) {
        console.error('GET /farmers/:id order lookup failed:', ordsErr.message);
        return res.status(500).json({ error: 'Could not load this seller. Please try again.' });
      }
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
router.patch('/:id/block', requirePermission('farmer_management','edit'), async (req, res) => {
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
router.patch('/:id/unblock', requirePermission('farmer_management','edit'), async (req, res) => {
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
