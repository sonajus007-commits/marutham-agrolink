const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');
const { syncPrices, getLastSync } = require('../utils/priceSync');
const { publicFarmer } = require('../utils/publicShape');

const router = express.Router();

// The product master catalog (produce types + government prices) is central master
// data. Writes are gated on the Product Approval module's strong actions, which only
// Admin holds ('edit'/'delete') — reproducing the old Head-Office-only rule. The
// tiered managers keep 'approve' (for seller listings), not master-catalog edit.
const requireCatalogEdit = requirePermission('product_approval', 'edit');
const requireCatalogDelete = requirePermission('product_approval', 'delete');

// ── GET /products ─────────────────────────────────────────────────────────────
// Filters:  ?group=  ?district=  ?available=true|false  ?category=  ?q=
// Sort:     ?sort=name|newest        (default name)
// Paging:   ?limit=  ?offset=        (default limit 24, capped at 100)
//
// The response is BOUNDED — it never returns the whole catalogue in one call, so
// a large catalogue cannot flood the API or the client. `count` is the total
// number of rows that match the filters (before paging), for building pager UI.
// It is named `count`, NOT `total`: the money-coercing response middleware would
// rewrite a field called `total` into a rupee string.
const PRODUCTS_PAGE_DEFAULT = 24;
const PRODUCTS_PAGE_MAX = 100;

router.get('/', async (req, res) => {
  const { group, district, available, category, q, sort } = req.query;

  const limit = Math.min(
    Math.max(parseInt(req.query.limit, 10) || PRODUCTS_PAGE_DEFAULT, 1),
    PRODUCTS_PAGE_MAX,
  );
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  let query = supabase
    .from('products')
    .select(
      `
      *,
      product_district_prices ( district, market_price, handling ),
      product_ratings ( farmer_id, sum_stars, num_ratings )
    `,
      { count: 'exact' },
    );

  // Sort: name (default) or newest-first. Price sort is not offered here because
  // price lives per-district in a child table, not on the product row.
  query = sort === 'newest' ? query.order('created_at', { ascending: false }) : query.order('name');

  if (group) query = query.eq('product_group', group);
  if (category) query = query.ilike('category', category); // exact, case-insensitive
  if (available !== undefined) query = query.eq('available', available === 'true');
  // Search matches the English name or the regional (Tamil) name. `*` is the
  // PostgREST wildcard inside an .or() filter string.
  if (q && String(q).trim()) {
    const term = String(q).trim().replace(/[%,()*]/g, ''); // strip filter-syntax chars
    if (term) query = query.or(`name.ilike.*${term}*,regional_name.ilike.*${term}*`);
  }

  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
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

  // `count` is the total matching rows (all pages); named count, not total, on
  // purpose — see the note above the handler.
  res.json({ products, count: count ?? products.length, limit, offset });
});

// ── GET /products/categories ──────────────────────────────────────────────────
// The distinct categories the catalogue carries, with a product count each — for
// the category rail and the /category/:slug pages. Defined BEFORE /:id so
// "categories" is not swallowed as a product id. ?available=true counts only
// buyable products. Only the `category` column is read, so the payload is small
// even for a large catalogue.
router.get('/categories', async (req, res) => {
  const { available } = req.query;
  let query = supabase.from('products').select('category');
  if (available !== undefined) query = query.eq('available', available === 'true');

  const { data, error } = await query;
  if (error) {
    console.error('GET /products/categories error:', error);
    return res.status(500).json({ error: 'Could not fetch categories.' });
  }

  const counts = new Map();
  for (const row of data) {
    const name = (row.category || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const categories = [...counts.entries()]
    .map(([name, count]) => ({ name, count })) // `count`, not `total` — money middleware
    .sort((a, b) => a.name.localeCompare(b.name));

  res.json({ categories });
});

// ── GET /products/:id ─────────────────────────────────────────────────────────
// Full detail: product + each farmer's listing + that farmer's rating for this
// product. PUBLIC, so it runs optionalAuth: a signed-in customer sees who they
// are buying from, a stranger sees only the district (see utils/publicShape.js).
router.get('/:id', optionalAuth, async (req, res) => {
  const { data: product, error } = await supabase
    .from('products')
    .select(`
      *,
      product_district_prices ( district, market_price, handling )
    `)
    .eq('id', req.params.id)
    .single();

  if (error || !product) return res.status(404).json({ error: 'Product not found.' });

  // Active farmer listings for this product, with the grower behind each one.
  //
  // The rating is NOT embedded here: product_ratings has no foreign key to
  // farmer_listings (it is keyed by farmer_id + product_id), so asking PostgREST
  // for `rating:product_ratings(...)` failed with "could not find a relationship"
  // — and because the error was never checked, this endpoint quietly served an
  // EMPTY listings array to every caller. Ratings are fetched separately and
  // matched on farmer_id, the same way GET /products does it.
  const { data: listings, error: le } = await supabase
    .from('farmer_listings')
    .select(`
      id, farmer_price, qty_available, listed, confirmed,
      time_available, cutoff_ts, bulk_qty, bulk_disc_pct,
      farmer:users ( id, fname, lname, village_town, district )
    `)
    .eq('product_id', req.params.id)
    .eq('listed', true);

  if (le) {
    console.error('GET /products/:id listings error:', le);
    return res.status(500).json({ error: 'Could not fetch listings for this product.' });
  }

  const { data: ratings, error: re } = await supabase
    .from('product_ratings')
    .select('farmer_id, sum_stars, num_ratings')
    .eq('product_id', req.params.id);

  if (re) {
    console.error('GET /products/:id ratings error:', re);
    return res.status(500).json({ error: 'Could not fetch ratings for this product.' });
  }

  const ratingByFarmer = new Map((ratings || []).map(r => [r.farmer_id, r]));

  const enrichedListings = (listings || []).map(l => {
    const r = ratingByFarmer.get(l.farmer?.id);
    return {
      ...l,
      farmer: publicFarmer(l.farmer, req.user),
      farmer_avg_rating: r && r.num_ratings > 0
        ? (r.sum_stars / r.num_ratings).toFixed(1)
        : null,
    };
  });

  res.json({ product, listings: enrichedListings });
});

// ── POST /products  (Head Office only) ────────────────────────────────────────
router.post('/', requireCatalogEdit, async (req, res) => {
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
router.patch('/:id', requireCatalogEdit, async (req, res) => {
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
router.put('/:id/prices', requireCatalogEdit, async (req, res) => {
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

// ── DELETE /products/:id/prices/:district  (Head Office only) ─────────────────
// Removes one district's govt price. PUT only upserts, so this is the only way to
// take a district off a product. District arrives URL-encoded (Express decodes it).
router.delete('/:id/prices/:district', requireCatalogEdit, async (req, res) => {
  const { id, district } = req.params;

  const { error } = await supabase
    .from('product_district_prices')
    .delete()
    .eq('product_id', id)
    .eq('district', district);

  if (error) {
    console.error('DELETE /products/:id/prices/:district error:', error);
    return res.status(500).json({ error: 'Could not remove the district price.' });
  }

  res.json({ message: `Removed price for ${district}.` });
});

// ── GET /products/sync-prices/status  (admin only) ───────────────────────────
router.get('/sync-prices/status', requirePermission('product_approval','view'), async (req, res) => {
  res.json({ sync: getLastSync() });
});

// ── POST /products/sync-prices  (Head Office only — manual trigger) ───────────
router.post('/sync-prices', requireCatalogEdit, async (req, res) => {
  try {
    const result = await syncPrices();
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /products/:id  (Head Office only) ──────────────────────────────────
router.delete('/:id', requireCatalogDelete, async (req, res) => {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(404).json({ error: 'Product not found or already deleted.' });

  res.json({ message: 'Product deleted.' });
});

module.exports = router;
