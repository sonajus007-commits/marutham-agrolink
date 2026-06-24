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
  const { data: order } = await supabase
    .from('orders')
    .select('id, consumer_id, status, delivered_at')
    .eq('id', req.params.id)
    .single();

  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only rate your own orders.' });
  }
  if (order.status !== 'Delivered') {
    return res.status(400).json({ error: 'You can only rate items after the order is delivered.' });
  }

  // Fetch the item — must belong to this order
  const { data: item } = await supabase
    .from('order_items')
    .select('id, farmer_id, product_id, rated')
    .eq('id', req.params.itemId)
    .eq('order_id', order.id)
    .single();

  if (!item) return res.status(404).json({ error: 'Item not found in this order.' });
  if (item.rated) return res.status(409).json({ error: 'You have already rated this item.' });

  // Mark item as rated
  const { error: itemErr } = await supabase
    .from('order_items')
    .update({ rated: true, rating_value, rated_at: new Date().toISOString() })
    .eq('id', item.id);

  if (itemErr) return res.status(500).json({ error: 'Could not save rating.' });

  // Upsert into product_ratings (farmer + product aggregate)
  const { data: existing } = await supabase
    .from('product_ratings')
    .select('id, sum_stars, num_ratings')
    .eq('farmer_id', item.farmer_id)
    .eq('product_id', item.product_id)
    .maybeSingle();

  if (existing) {
    await supabase
      .from('product_ratings')
      .update({
        sum_stars:   existing.sum_stars + rating_value,
        num_ratings: existing.num_ratings + 1,
      })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('product_ratings')
      .insert({ farmer_id: item.farmer_id, product_id: item.product_id, sum_stars: rating_value, num_ratings: 1 });
  }

  res.json({ message: 'Rating saved. Thank you!', rating_value });
});

// ── GET /ratings/top  (admin or farmer) ───────────────────────────────────────
// ?scope=district&district=Chennai  or  ?scope=all
router.get('/top', async (req, res) => {
  if (req.user.role === 'consumer') {
    return res.status(403).json({ error: 'Only admins and farmers can view top ratings.' });
  }

  const { data, error } = await supabase
    .from('product_ratings')
    .select(`
      sum_stars, num_ratings,
      farmer:users ( id, fname, lname, village_town, district ),
      product:products ( id, code, name, unit )
    `)
    .gt('num_ratings', 0)
    .order('sum_stars', { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ error: 'Could not fetch ratings.' });

  const results = data.map(r => ({
    product: r.product,
    farmer:  r.farmer,
    avg_rating: (r.sum_stars / r.num_ratings).toFixed(1),
    num_ratings: r.num_ratings,
  }));

  res.json({ top_ratings: results });
});

module.exports = router;
