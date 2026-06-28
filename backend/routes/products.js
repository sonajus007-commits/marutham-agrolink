const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { syncPrices, getLastSync } = require('../utils/priceSync');

const router = express.Router();

// ── Guard: Head Office admins only ────────────────────────────────────────────
function requireHeadOffice(req, res, next) {
  if (req.user.role !== 'admin' || req.user.admin_role !== 'Head Office') {
    return res.status(403).json({ error: 'Only Head Office admins can perform this action.' });
  }
  next();
}

// ── GET /products ─────────────────────────────────────────────────────────────
// Filters: ?group=  ?district=  ?available=true|false
router.get('/', async (req, res) => {
  const { group, district, available } = req.query;

  let query = supabase
    .from('products')
    .select(`
      *,
      product_district_prices ( district, market_price, handling ),
      product_ratings ( farmer_id, sum_stars, num_ratings )
    `)
    .order('name');

  if (group)     query = query.eq('product_group', group);
  if (available !== undefined) query = query.eq('available', available === 'true');

  const { data, error } = await query;
  if (error) {
    console.error('GET /products error:', error);
    return res.status(500).json({ error: 'Could not fetch products.' });
  }

  // If ?district= is given, attach only that district's price to each product
  const products = data.map(p => {
    const distPrices = p.product_district_prices || [];
    const distRow = district
      ? distPrices.find(d => d.district.toLowerCase() === district.toLowerCase())
      : null;

    // Compute average rating across all farmer-product combos for this product
    const ratings = p.product_ratings || [];
    const totalStars = ratings.reduce((s, r) => s + r.sum_stars, 0);
    const totalRatings = ratings.reduce((s, r) => s + r.num_ratings, 0);
    const avg_rating = totalRatings > 0 ? (totalStars / totalRatings).toFixed(1) : null;

    return {
      ...p,
      district_price:           distRow || null,
      // Keep full array when no district filter (admin view); drop when consumer fetches by district
      product_district_prices:  district ? undefined : distPrices,
      avg_rating,
      product_ratings:          undefined,
    };
  });

  res.json({ products });
});

// ── GET /products/:id ─────────────────────────────────────────────────────────
// Full detail: product + each farmer's listing + that farmer's rating for this product
router.get('/:id', async (req, res) => {
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      *,
      product_district_prices ( district, market_price, handling )
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !product) return res.status(404).json({ error: 'Product not found.' });

  // Fetch active farmer listings for this product + farmer profile + their rating
  const { data: listings } = await supabase
    .from('farmer_listings')
    .select(`
      id, farmer_price, qty_available, listed, confirmed,
      time_available, cutoff_ts, bulk_qty, bulk_disc_pct,
      farmer:users ( id, fname, lname, village_town, district ),
      rating:product_ratings ( sum_stars, num_ratings )
    `)
    .eq('product_id', req.params.id)
    .eq('listed', true);

  const enrichedListings = (listings || []).map(l => ({
    ...l,
    farmer_avg_rating: l.rating && l.rating.num_ratings > 0
      ? (l.rating.sum_stars / l.rating.num_ratings).toFixed(1)
      : null,
    rating: undefined,
  }));

  res.json({ product, listings: enrichedListings });
});

// ── POST /products  (Head Office only) ────────────────────────────────────────
router.post('/', requireAuth, requireHeadOffice, async (req, res) => {
  const {
    code, product_group, category, sub_type, name, regional_name,
    unit, exotic, platform_fee_pct, available, price_date,
  } = req.body;

  if (!code || !name || !unit) {
    return res.status(400).json({ error: 'code, name, and unit are required.' });
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      code, product_group, category, sub_type, name, regional_name,
      unit, exotic: exotic ?? false,
      platform_fee_pct: platform_fee_pct ?? 5,
      available: available ?? true,
      price_date,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return res.status(409).json({ error: `Product code "${code}" already exists.` });
    console.error('POST /products error:', error);
    return res.status(500).json({ error: 'Could not create product.' });
  }

  res.status(201).json({ message: 'Product created.', product: data });
});

// ── PATCH /products/:id  (Head Office only) ───────────────────────────────────
router.patch('/:id', requireAuth, requireHeadOffice, async (req, res) => {
  const ALLOWED = [
    'product_group', 'category', 'sub_type', 'name', 'regional_name',
    'unit', 'exotic', 'platform_fee_pct', 'available', 'price_date',
  ];

  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('products')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error || !data) return res.status(404).json({ error: 'Product not found.' });

  res.json({ message: 'Product updated.', product: data });
});

// ── PUT /products/:id/prices  (Head Office only) ─────────────────────────────
// Body: [{ district, market_price_rs, handling_rs }]
// Converts rupees to paise and upserts into product_district_prices.
router.put('/:id/prices', requireAuth, requireHeadOffice, async (req, res) => {
  const prices = req.body.prices;
  if (!Array.isArray(prices) || prices.length === 0) {
    return res.status(400).json({ error: 'prices array is required.' });
  }

  const rows = prices
    .filter(p => p.district && p.market_price_rs > 0)
    .map(p => ({
      product_id:   req.params.id,
      district:     p.district,
      market_price: Math.round(parseFloat(p.market_price_rs) * 100),
      handling:     Math.round(parseFloat(p.handling_rs || 0) * 100),
    }));

  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid price rows provided.' });
  }

  const { error } = await supabase
    .from('product_district_prices')
    .upsert(rows, { onConflict: 'product_id,district' });

  if (error) {
    console.error('PUT /products/:id/prices error:', error);
    return res.status(500).json({ error: 'Could not save prices.' });
  }

  res.json({ message: `Saved ${rows.length} district price(s).` });
});

// ── GET /products/sync-prices/status  (admin only) ───────────────────────────
router.get('/sync-prices/status', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' });
  res.json({ sync: getLastSync() });
});

// ── POST /products/sync-prices  (Head Office only — manual trigger) ───────────
router.post('/sync-prices', requireAuth, requireHeadOffice, async (req, res) => {
  try {
    const result = await syncPrices();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /products/:id  (Head Office only) ──────────────────────────────────
router.delete('/:id', requireAuth, requireHeadOffice, async (req, res) => {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(404).json({ error: 'Product not found or already deleted.' });

  res.json({ message: 'Product deleted.' });
});

module.exports = router;
