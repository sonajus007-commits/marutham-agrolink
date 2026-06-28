const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { getFeeForSeller } = require('../utils/fees');

const router = express.Router();

// All listing routes require login
router.use(requireAuth);

// ── GET /listings ─────────────────────────────────────────────────────────────
// Farmer → their own listings
// Anyone → ?product=:id returns all offers for that product (consumer product page)
router.get('/', async (req, res) => {
  const { product } = req.query;

  if (product) {
    // Public-ish: offers for a specific product (used on consumer product detail page)
    const { data, error } = await supabase
      .from('farmer_listings')
      .select(`
        id, farmer_price, qty_available, listed, confirmed,
        time_available, cutoff_ts, bulk_qty, bulk_disc_pct, qty_type, qty_value,
        farmer:users ( id, fname, lname, village_town, district, seller_type ),
        product:products ( id, code, name, unit, platform_fee_pct )
      `)
      .eq('product_id', product)
      .eq('listed', true)
      .eq('listing_status', 'active');

    if (error) {
      console.error('GET /listings?product error:', error);
      return res.status(500).json({ error: 'Could not fetch listings.' });
    }

    // Compute consumer_price and fee_pct per listing so clients can display the right price
    const enriched = (data || []).map(l => {
      const feePct       = getFeeForSeller(l.farmer?.seller_type);
      const consumerPrice = Math.round(l.farmer_price * (1 + feePct / 100));
      return { ...l, fee_pct: feePct, consumer_price: consumerPrice };
    });

    return res.json({ listings: enriched });
  }

  // Consumer browsing: ?district=X returns all active listings from farmers in that district
  const { district } = req.query;
  if (district) {
    // Step 1: find farmer IDs in this district
    const { data: farmerRows } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'farmer')
      .ilike('district', district);

    const farmerIds = (farmerRows || []).map(f => f.id);
    if (farmerIds.length === 0) {
      return res.json({ listings: [], by_product: {} });
    }

    const { data, error } = await supabase
      .from('farmer_listings')
      .select(`
        id, product_id, farmer_price, qty_available,
        time_available, cutoff_ts, bulk_qty, bulk_disc_pct, qty_type, qty_value, images,
        farmer:users ( id, fname, lname, village_town, district, seller_type )
      `)
      .eq('listed', true)
      .eq('listing_status', 'active')
      .in('farmer_id', farmerIds);

    if (error) {
      console.error('GET /listings?district error:', error);
      return res.status(500).json({ error: 'Could not fetch listings.' });
    }

    // Enrich with seller-type-aware consumer price (mirrors ?product= query)
    const enriched = (data || []).map(l => {
      const feePct       = getFeeForSeller(l.farmer?.seller_type);
      const consumerPrice = Math.round(l.farmer_price * (1 + feePct / 100));
      return { ...l, fee_pct: feePct, consumer_price: consumerPrice };
    });

    // Group by product_id so the consumer can look up offers per product quickly
    const byProduct = {};
    enriched.forEach(l => {
      if (!l.farmer) return;
      if (!byProduct[l.product_id]) byProduct[l.product_id] = [];
      byProduct[l.product_id].push(l);
    });
    return res.json({ listings: enriched, by_product: byProduct });
  }

  // Farmer fetches only their own listings
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Use ?product=:id to browse listings, or log in as a farmer.' });
  }

  const { data, error } = await supabase
    .from('farmer_listings')
    .select(`
      *,
      product:products ( id, code, name, unit, platform_fee_pct, available )
    `)
    .eq('farmer_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('GET /listings (farmer) error:', error);
    return res.status(500).json({ error: 'Could not fetch your listings.' });
  }

  res.json({ listings: data });
});

// ── POST /listings  (farmer only) ────────────────────────────────────────────
router.post('/', async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers can create listings.' });
  }

  const {
    product_id, farmer_price, qty_available,
    time_available, cutoff_ts, bulk_qty, bulk_disc_pct,
    qty_type, qty_value,
  } = req.body;

  if (!product_id || farmer_price == null || qty_available == null) {
    return res.status(400).json({ error: 'product_id, farmer_price, and qty_available are required.' });
  }
  if (farmer_price < 0) return res.status(400).json({ error: 'farmer_price must be ≥ 0.' });
  if (qty_available < 0) return res.status(400).json({ error: 'qty_available must be ≥ 0.' });

  // Verify the product exists and is active
  const { data: product } = await supabase
    .from('products')
    .select('id, available')
    .eq('id', product_id)
    .single();

  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!product.available) return res.status(400).json({ error: 'This product is not currently active.' });

  const { data, error } = await supabase
    .from('farmer_listings')
    .insert({
      farmer_id: req.user.id,
      product_id, farmer_price, qty_available,
      time_available, cutoff_ts, bulk_qty, bulk_disc_pct,
      qty_type, qty_value,
      listed: true,
      listing_status: 'pending',
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'You already have a listing for this product. Use PATCH to update it.' });
    }
    console.error('POST /listings error:', error);
    return res.status(500).json({ error: 'Could not create listing.' });
  }

  res.status(201).json({ message: 'Listing created.', listing: data });
});

// ── PATCH /listings/:id  (farmer only, own listing) ──────────────────────────
router.patch('/:id', async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers can update listings.' });
  }

  // Confirm the listing belongs to this farmer
  const { data: existing } = await supabase
    .from('farmer_listings')
    .select('id, farmer_id')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Listing not found.' });
  if (existing.farmer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own listings.' });
  }

  const ALLOWED = [
    'farmer_price', 'qty_available', 'listed', 'confirmed',
    'time_available', 'cutoff_ts', 'bulk_qty', 'bulk_disc_pct',
    'qty_type', 'qty_value', 'images',
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
    .from('farmer_listings')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    console.error('PATCH /listings/:id error:', error);
    return res.status(500).json({ error: 'Could not update listing.' });
  }

  res.json({ message: 'Listing updated.', listing: data });
});

// ── DELETE /listings/:id  (farmer only, own listing) ─────────────────────────
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers can delete listings.' });
  }

  const { data: existing } = await supabase
    .from('farmer_listings')
    .select('id, farmer_id')
    .eq('id', req.params.id)
    .single();

  if (!existing) return res.status(404).json({ error: 'Listing not found.' });
  if (existing.farmer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own listings.' });
  }

  const { error } = await supabase
    .from('farmer_listings')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(500).json({ error: 'Could not delete listing.' });

  res.json({ message: 'Listing deleted.' });
});

// ── GET /listings/admin/pending  (admin only) ────────────────────────────────
router.get('/admin/pending', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const status = req.query.status || 'pending';
  const { data, error } = await supabase
    .from('farmer_listings')
    .select(`
      id, farmer_price, qty_available, listing_status, created_at, images,
      farmer:users ( id, fname, lname, login_id, district, seller_type ),
      product:products ( id, code, name, unit )
    `)
    .eq('listing_status', status)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ listings: data || [] });
});

// ── PATCH /listings/:id/status  (admin only) ─────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  const { status, rejection_reason } = req.body;
  if (!['active', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'status must be active, rejected, or pending.' });
  }
  const update = { listing_status: status, updated_at: new Date().toISOString() };
  if (status === 'rejected' && rejection_reason) update.rejection_reason = rejection_reason;
  const { data, error } = await supabase
    .from('farmer_listings')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: `Listing ${status}.`, listing: data });
});

module.exports = router;
