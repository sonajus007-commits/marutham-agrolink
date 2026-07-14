const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── POST /orders/:id/items/:itemId/rate  (consumer, after delivery, once only) ─
router.post('/:id/items/:itemId/rate', async (req, res) => {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only consumers can rate items.' });
  }

  const { rating_value } = req.body;
  if (!rating_value || rating_value < 1 || rating_value > 5) {
    return res.status(400).json({ error: 'rating_value must be between 1 and 5.' });
  }

  // Fetch the order — must be delivered and owned by this consumer
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, consumer_id, status, delivered_at')
    .eq('id', req.params.id)
    .maybeSingle();

  if (orderErr) {
    console.error('POST /ratings order lookup failed:', orderErr.message);
    return res.status(500).json({ error: 'Could not load that order. Please try again.' });
  }
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only rate your own orders.' });
  }
  if (order.status !== 'Delivered') {
    return res.status(400).json({ error: 'You can only rate items after the order is delivered.' });
  }

  // Fetch the item — must belong to this order
  const { data: item, error: itemErr2 } = await supabase
    .from('order_items')
    .select('id, farmer_id, product_id, rated')
    .eq('id', req.params.itemId)
    .eq('order_id', order.id)
    .maybeSingle();

  if (itemErr2) {
    console.error('POST /ratings item lookup failed:', itemErr2.message);
    return res.status(500).json({ error: 'Could not load that item. Please try again.' });
  }
  if (!item) return res.status(404).json({ error: 'Item not found in this order.' });
  if (item.rated) return res.status(409).json({ error: 'You have already rated this item.' });

  // Mark item as rated
  const { error: itemErr } = await supabase
    .from('order_items')
    .update({ rated: true, rating_value, rated_at: new Date().toISOString() })
    .eq('id', item.id);

  if (itemErr) return res.status(500).json({ error: 'Could not save rating.' });

  // Upsert into product_ratings (farmer + product aggregate).
  //
  // Three separate silent failures lived here. The READ, unread, left `existing`
  // null and sent us down the INSERT branch — writing a SECOND aggregate row for a
  // farmer+product that already had one, which then made this very maybeSingle
  // raise PGRST116 on two rows, so every later rating inserted yet another. The
  // aggregate quietly stopped being an aggregate.
  //
  // And both WRITES dropped their result, so a failed rating still answered
  // "Rating saved. Thank you!" — while order_items.rated was already true from the
  // update above, which means the customer could never rate it again. The rating
  // was not saved, could not be retried, and they were thanked for it.
  const { data: existing, error: existingErr } = await supabase
    .from('product_ratings')
    .select('id, sum_stars, num_ratings')
    .eq('farmer_id', item.farmer_id)
    .eq('product_id', item.product_id)
    .maybeSingle();

  if (existingErr) {
    console.error('POST /ratings aggregate lookup failed:', existingErr.message);
    return res.status(500).json({ error: 'Could not save your rating. Please try again.' });
  }

  let aggErr;
  if (existing) {
    const { error } = await supabase
      .from('product_ratings')
      .update({
        sum_stars:   existing.sum_stars + rating_value,
        num_ratings: existing.num_ratings + 1,
      })
      .eq('id', existing.id);
    aggErr = error;
  } else {
    const { error } = await supabase
      .from('product_ratings')
      .insert({ farmer_id: item.farmer_id, product_id: item.product_id, sum_stars: rating_value, num_ratings: 1 });
    aggErr = error;
  }

  if (aggErr) {
    console.error(`Rating for item ${item.id} was recorded on the order but NOT added to the ` +
                  `product_ratings aggregate:`, aggErr.message);
    return res.status(500).json({ error: 'Could not save your rating. Please try again.' });
  }

  res.json({ message: 'Rating saved. Thank you!', rating_value });
});

// ── GET /ratings/top  (all authenticated users) ───────────────────────────────
// Consumers can call this to display ratings in the shop.
router.get('/top', async (req, res) => {
  const { data, error } = await supabase
    .from('product_ratings')
    .select(`
      product_id, sum_stars, num_ratings,
      farmer:users ( id, fname, lname, village_town, district ),
      product:products ( id, code, name, unit )
    `)
    .gt('num_ratings', 0)
    .order('sum_stars', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: 'Could not fetch ratings.' });

  const results = data.map(r => ({
    product_id:  r.product_id,
    product:     r.product,
    farmer:      r.farmer,
    avg_rating:  (r.sum_stars / r.num_ratings).toFixed(1),
    num_ratings: r.num_ratings,
  }));

  res.json({ top_ratings: results });
});

// ── GET /ratings/mine  (seller: my customer-ratings summary) ──────────────────
// The overall average + count across all this seller's products, plus a per-product
// breakdown, straight from the product_ratings aggregate (keyed by farmer_id).
router.get('/mine', async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only sellers have customer ratings.' });
  }
  const { data, error } = await supabase
    .from('product_ratings')
    .select('product_id, sum_stars, num_ratings, product:products ( name, unit )')
    .eq('farmer_id', req.user.id)
    .gt('num_ratings', 0);
  if (error) return res.status(500).json({ error: 'Could not load your customer ratings.' });

  const rows = data || [];
  const totalRatings = rows.reduce((s, r) => s + (r.num_ratings || 0), 0);
  const totalStars = rows.reduce((s, r) => s + (r.sum_stars || 0), 0);
  const products = rows
    .map((r) => ({
      product: r.product?.name || '—',
      unit: r.product?.unit || '',
      avg: r.num_ratings ? Number((r.sum_stars / r.num_ratings).toFixed(1)) : 0,
      count: r.num_ratings || 0,
    }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count);

  res.json({
    avg: totalRatings ? Number((totalStars / totalRatings).toFixed(1)) : 0,
    total_ratings: totalRatings,
    products,
  });
});

module.exports = router;
