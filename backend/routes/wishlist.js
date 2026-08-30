const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { validateBody, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// Saving a product for later is a consumer action. Scoped to the caller throughout —
// a user only ever sees or changes their own list.
function consumersOnly(req, res, next) {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only customers have a wishlist.' });
  }
  next();
}

// ── GET /wishlist ── the caller's saved products (with catalogue detail) ──────────
router.get('/', consumersOnly, async (req, res) => {
  const { data, error } = await supabase
    .from('wishlists')
    .select('product_id, created_at, product:products ( id, name, regional_name, unit, category, available )')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('GET /wishlist error:', error);
    return res.status(500).json({ error: 'Could not load your saved items.' });
  }
  res.json({ items: data || [] });
});

// ── POST /wishlist ── save a product (idempotent) ────────────────────────────────
router.post(
  '/',
  consumersOnly,
  validateBody(z.object({ product_id: z.string().uuid('A valid product_id is required.') })),
  async (req, res) => {
    // upsert on the (user, product) unique key → hearting an already-saved product is
    // a no-op success, not a 409.
    const { error } = await supabase
      .from('wishlists')
      .upsert({ user_id: req.user.id, product_id: req.body.product_id }, { onConflict: 'user_id,product_id' });

    if (error) {
      console.error('POST /wishlist error:', error);
      return res.status(500).json({ error: 'Could not save this item.' });
    }
    res.status(201).json({ ok: true });
  },
);

// ── DELETE /wishlist/:productId ── remove a saved product ────────────────────────
router.delete('/:productId', consumersOnly, async (req, res) => {
  const { error } = await supabase
    .from('wishlists')
    .delete()
    .eq('user_id', req.user.id)
    .eq('product_id', req.params.productId);

  if (error) {
    console.error('DELETE /wishlist error:', error);
    return res.status(500).json({ error: 'Could not remove this item.' });
  }
  res.json({ ok: true });
});

module.exports = router;
