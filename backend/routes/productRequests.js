const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');
const { notify } = require('../utils/notifications');

const router = express.Router();
router.use(requireAuth);

// Products are an admin-curated catalogue (see migration 054). A seller can PROPOSE
// a product here; an admin with catalogue rights reviews it and, on approval, creates
// the real products row. Reviewing is the Product Approval module's 'edit' action
// (the same strong action that guards POST /products) — only Admin holds it.
const requireReview = (req, res, next) => {
  if (!can(req.user, 'product_approval', 'edit')) {
    return res.status(403).json({ error: 'Product catalogue permission required.' });
  }
  next();
};

const createSchema = z.object({
  name: z.string().trim().min(1, 'A product name is required.').max(120),
  unit: z.string().trim().min(1, 'A unit is required (e.g. kg, bunch, packet).').max(40),
  regional_name: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
});

// ── POST /product-requests  (seller: farmer / retailer) ──────────────────────────
router.post('/', validateBody(createSchema), async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only sellers can request a new product.' });
  }
  const { name, unit, regional_name, category, note } = req.body;

  const { data, error } = await supabase
    .from('product_requests')
    .insert({
      requested_by: req.user.id,
      name,
      unit,
      regional_name: regional_name || null,
      category: category || null,
      note: note || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('POST /product-requests error:', error);
    return res.status(500).json({ error: 'Could not submit your product request.' });
  }
  res.status(201).json({ message: 'Product request submitted for review.', request: data });
});

// ── GET /product-requests ────────────────────────────────────────────────────────
// A seller sees their OWN requests; a reviewer sees everything, optionally filtered
// by ?status=pending|approved|rejected.
router.get('/', async (req, res) => {
  const isReviewer = can(req.user, 'product_approval', 'edit');
  if (req.user.role !== 'farmer' && !isReviewer) {
    return res.status(403).json({ error: 'Not allowed.' });
  }

  let q = supabase
    .from('product_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (req.user.role === 'farmer' && !isReviewer) {
    q = q.eq('requested_by', req.user.id);
  } else if (['pending', 'approved', 'rejected'].includes(req.query.status)) {
    q = q.eq('status', req.query.status);
  }

  const { data, error } = await q;
  if (error) {
    console.error('GET /product-requests error:', error);
    return res.status(500).json({ error: 'Could not load product requests.' });
  }
  res.json({ requests: data || [] });
});

const approveSchema = z.object({
  code: z.string().trim().min(1, 'A catalogue code is required.').max(40),
  category: z.string().trim().max(80).optional(),
  product_group: z.string().trim().max(80).optional(),
  sub_type: z.string().trim().max(80).optional(),
  regional_name: z.string().trim().max(120).optional(),
  platform_fee_pct: z.coerce.number().min(0).max(100).optional(),
});

// ── POST /product-requests/:id/approve  (reviewer) ───────────────────────────────
// Creates the catalogue product from the request (admin assigns the code and can
// refine category/group/fee), links it back, and tells the seller.
router.post('/:id/approve', requireReview, validateBody(approveSchema), async (req, res) => {
  const { data: reqRow, error: fErr } = await supabase
    .from('product_requests')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fErr) return res.status(500).json({ error: 'Could not load the request.' });
  if (!reqRow) return res.status(404).json({ error: 'Product request not found.' });
  if (reqRow.status !== 'pending') {
    return res.status(409).json({ error: `This request is already ${reqRow.status}.` });
  }

  // Create the catalogue product. Code collisions are the one expected failure — a
  // 409 tells the reviewer to pick another code rather than a generic 500.
  const { data: product, error: pErr } = await supabase
    .from('products')
    .insert({
      code: req.body.code,
      name: reqRow.name,
      unit: reqRow.unit,
      regional_name: req.body.regional_name ?? reqRow.regional_name ?? null,
      category: req.body.category ?? reqRow.category ?? null,
      product_group: req.body.product_group ?? null,
      sub_type: req.body.sub_type ?? null,
      platform_fee_pct: req.body.platform_fee_pct ?? 5,
      available: true,
    })
    .select()
    .single();

  if (pErr) {
    if (pErr.code === '23505') {
      return res.status(409).json({ error: `Product code "${req.body.code}" already exists. Choose another.` });
    }
    console.error('Approve product-request: create product failed:', pErr);
    return res.status(500).json({ error: 'Could not create the catalogue product.' });
  }

  const { error: uErr } = await supabase
    .from('product_requests')
    .update({
      status: 'approved',
      product_id: product.id,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', reqRow.id);
  if (uErr) {
    // The product IS created; leaving the request un-updated is recoverable (the
    // reviewer can retry, hitting the 23505 above), so surface it rather than hide it.
    console.error('Approve product-request: request update failed:', uErr.message);
    return res.status(500).json({ error: 'The product was created but the request could not be closed. Please retry.' });
  }

  notify(reqRow.requested_by, {
    type: 'product_request_approved',
    title: 'Product approved',
    body: `“${reqRow.name}” is now in the catalogue — you can list it.`,
    data: { product_id: product.id },
  });

  res.json({ message: `“${reqRow.name}” approved and added to the catalogue.`, product });
});

// ── POST /product-requests/:id/reject  (reviewer) ────────────────────────────────
router.post(
  '/:id/reject',
  requireReview,
  validateBody(z.object({ reason: z.string().trim().min(1, 'A reason is required.').max(500) })),
  async (req, res) => {
    const { data: reqRow, error: fErr } = await supabase
      .from('product_requests')
      .select('id, requested_by, name, status')
      .eq('id', req.params.id)
      .maybeSingle();
    if (fErr) return res.status(500).json({ error: 'Could not load the request.' });
    if (!reqRow) return res.status(404).json({ error: 'Product request not found.' });
    if (reqRow.status !== 'pending') {
      return res.status(409).json({ error: `This request is already ${reqRow.status}.` });
    }

    const { error: uErr } = await supabase
      .from('product_requests')
      .update({
        status: 'rejected',
        review_reason: req.body.reason,
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reqRow.id);
    if (uErr) return res.status(500).json({ error: 'Could not reject the request.' });

    notify(reqRow.requested_by, {
      type: 'product_request_rejected',
      title: 'Product request update',
      body: `“${reqRow.name}” was not added: ${req.body.reason}`,
    });

    res.json({ message: 'Product request rejected. The seller has been notified.' });
  },
);

module.exports = router;
