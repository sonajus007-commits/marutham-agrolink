const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');
const { getFeeForSeller } = require('../utils/fees');
const { validateImages } = require('../utils/listings');
const notify = require('../utils/notify');

const router = express.Router();

// All listing routes require login
router.use(requireAuth);

// Role guards kept ahead of body validation so the 403 still precedes any 400.
function farmersOnly(req, res, next) {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmers can create listings.' });
  }
  next();
}
// Reviewing seller product listings is the Product Approval module: Admin + the
// tiered managers (Hub/District/Regional/Zonal/State) hold 'approve'.
function canApproveListings(req, res, next) {
  if (!can(req.user, 'product_approval', 'approve')) {
    return res.status(403).json({ error: 'Product approval permission required.' });
  }
  next();
}

// Create: price and stock are coerced to numbers and required ≥ 0. The old checks
// (`farmer_price < 0`, `qty_available < 0`) compared the RAW body value, so a numeric
// string sailed past and was written to the listing untyped. `images` stays with the
// existing validateImages helper; passthrough carries the rest of the form through.
const createListingSchema = z
  .object({
    product_id: z.string().min(1, 'product_id, farmer_price, and qty_available are required.'),
    farmer_price: z.coerce
      .number({ message: 'product_id, farmer_price, and qty_available are required.' })
      .min(0, 'farmer_price must be ≥ 0.'),
    qty_available: z.coerce
      .number({ message: 'product_id, farmer_price, and qty_available are required.' })
      .min(0, 'qty_available must be ≥ 0.'),
  })
  .passthrough();

// Only the status word is validated here; the "a rejection must give a reason" rule
// is conditional and stays in the handler.
const listingStatusSchema = z
  .object({
    status: z.enum(['active', 'rejected', 'pending'], {
      message: 'status must be active, rejected, or pending.',
    }),
  })
  .passthrough();

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
        farmer:users ( id, fname, lname, village_town, district, seller_type, status ),
        product:products ( id, code, name, unit, platform_fee_pct )
      `)
      .eq('product_id', product)
      .eq('listed', true)
      .eq('listing_status', 'active')
      .eq('confirmed', true);

    if (error) {
      console.error('GET /listings?product error:', error);
      return res.status(500).json({ error: 'Could not fetch listings.' });
    }

    // Only include listings from active (non-blocked) farmers
    const enriched = (data || [])
      .filter(l => l.farmer?.status === 'active')
      .map(l => {
        const feePct        = getFeeForSeller(l.farmer?.seller_type);
        const consumerPrice = Math.round(l.farmer_price * (1 + feePct / 100));
        const { status: _s, ...farmerPublic } = l.farmer; // strip status from response
        return { ...l, farmer: farmerPublic, fee_pct: feePct, consumer_price: consumerPrice };
      });

    return res.json({ listings: enriched });
  }

  // Consumer browsing: ?district=X returns all active listings from farmers in that district
  const { district } = req.query;
  if (district) {
    // Step 1: find only active (non-blocked) farmer IDs in this district
    const { data: farmerRows, error: farmerRowsErr } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'farmer')
      .eq('status', 'active')
      .ilike('district', district);

    // Unread, a failure here produced an EMPTY farmer list, which produced an empty
    // listing list, which is a shop with nothing in it — for an entire district, with
    // a 200 and no indication anything had gone wrong.
    if (farmerRowsErr) {
      console.error('GET /listings district farmer lookup failed:', farmerRowsErr.message);
      return res.status(500).json({ error: 'Could not load listings for that district. Please try again.' });
    }

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
      .eq('confirmed', true)
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
router.post('/', farmersOnly, validateBody(createListingSchema), async (req, res) => {
  const {
    product_id, farmer_price, qty_available,
    time_available, cutoff_ts, bulk_qty, bulk_disc_pct,
    qty_type, qty_value,
  } = req.body;

  // `images` was omitted from the destructure above and never inserted, so every
  // photo a farmer attached on create was silently discarded — they only stuck if
  // she later edited the listing, because PATCH did allow the field.
  const { images, error: imgErr } = validateImages(req.body.images);
  if (imgErr) return res.status(400).json({ error: imgErr });

  // Verify the product exists and is active
  const { data: product, error: productErr } = await supabase
    .from('products')
    .select('id, available')
    .eq('id', product_id)
    .maybeSingle();

  if (productErr) {
    console.error('Listing product lookup failed:', productErr.message);
    return res.status(500).json({ error: 'Could not verify that product. Please try again.' });
  }
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (!product.available) return res.status(400).json({ error: 'This product is not currently active.' });

  const { data, error } = await supabase
    .from('farmer_listings')
    .insert({
      farmer_id: req.user.id,
      product_id, farmer_price, qty_available,
      time_available, cutoff_ts, bulk_qty, bulk_disc_pct,
      qty_type, qty_value,
      ...(images !== undefined ? { images } : {}),
      listed: req.body.listed !== undefined ? Boolean(req.body.listed) : true,
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
  // An ownership guard must not answer "not found" because the database hiccuped —
  // it tells the farmer their own listing has vanished.
  const { data: existing, error: existingErr } = await supabase
    .from('farmer_listings')
    .select('id, farmer_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (existingErr) {
    console.error('Listing ownership lookup failed:', existingErr.message);
    return res.status(500).json({ error: 'Could not load that listing. Please try again.' });
  }
  if (!existing) return res.status(404).json({ error: 'Listing not found.' });
  if (existing.farmer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own listings.' });
  }

  // PATCH accepted `images` unvalidated — any array of anything, any size.
  const { error: imgErr } = validateImages(req.body.images);
  if (imgErr) return res.status(400).json({ error: imgErr });

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

  // An ownership guard must not answer "not found" because the database hiccuped —
  // it tells the farmer their own listing has vanished.
  const { data: existing, error: existingErr } = await supabase
    .from('farmer_listings')
    .select('id, farmer_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (existingErr) {
    console.error('Listing ownership lookup failed:', existingErr.message);
    return res.status(500).json({ error: 'Could not load that listing. Please try again.' });
  }
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
router.get('/admin/pending', canApproveListings, async (req, res) => {
  const status = req.query.status || 'pending';
  const { data, error } = await supabase
    .from('farmer_listings')
    .select(`
      id, farmer_price, qty_available, listing_status, created_at, images, rejection_reason,
      farmer:users ( id, fname, lname, login_id, district, seller_type, subscription_plan, subscription_expires_at ),
      product:products ( id, code, name, unit )
    `)
    .eq('listing_status', status)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ listings: data || [] });
});

// ── PATCH /listings/:id/status  (admin only) ─────────────────────────────────
router.patch('/:id/status', canApproveListings, validateBody(listingStatusSchema), async (req, res) => {
  const { status } = req.body;

  // A rejection MUST say why.
  //
  // The legacy admin page prompted for a reason labelled "(shown to farmer)", sent
  // it, and this route threw it away — there was no column. The reason is the whole
  // point of a rejection: without one the seller learns only that the answer is no,
  // with nothing to fix and nothing to appeal. Enforced server-side, not just in
  // the console, because the console is not the only thing that can call this.
  const reason = typeof req.body.rejection_reason === 'string'
    ? req.body.rejection_reason.trim()
    : '';
  if (status === 'rejected' && !reason) {
    return res.status(400).json({ error: 'A rejection reason is required — the seller is shown it.' });
  }

  const update = {
    listing_status: status,
    updated_at: new Date().toISOString(),
    // Set on rejection; CLEARED otherwise. A stale "produce looked spoiled" left
    // hanging off a listing that is now live and selling would be worse than no
    // reason at all — approving is what withdraws the objection.
    rejection_reason: status === 'rejected' ? reason : null,
  };
  const { data, error } = await supabase
    .from('farmer_listings')
    .update(update)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Tell the farmer the outcome. Approval already did this; a rejection was silent,
  // which is precisely how a seller ends up staring at "Contact support for details."
  if (status === 'active' || status === 'rejected') {
    try {
      // reads-ok: notification lookup only; the status change is already committed and
      // must not be failed by an email that could not be addressed
      const { data: full } = await supabase
        .from('farmer_listings')
        .select(`
          farmer:users ( id, fname, lname, email, phone, login_id ),
          product:products ( id, name )
        `)
        .eq('id', req.params.id)
        .single();
      if (full?.farmer && full?.product) {
        if (status === 'active') await notify.notifyProductApproved(full.farmer, full.product);
        else await notify.notifyProductRejected(full.farmer, full.product, reason);
      }
    } catch (e) {
      // A notification failure must not fail the decision — it is already written.
      console.error(`[LISTING ${status.toUpperCase()}] Notify error:`, e.message);
    }
  }

  res.json({ message: `Listing ${status}.`, listing: data });
});

module.exports = router;
