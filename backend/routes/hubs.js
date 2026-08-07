const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /hubs?state=&district=  — the hubs in one district: its main hub plus every
// taluk hub that connects to it. Used by the Delivery Agent profile (pick the
// taluk hub responsible for you) and by the VCO/Hub assign screens.
//
// district is required so this never dumps the whole 1,700-row network. Auth-only
// reference data — no geo-scope narrowing (an agent must see their own district's
// hubs even though they are geo-scoped elsewhere).
router.get('/', requireAuth, async (req, res) => {
  const state = (req.query.state || '').trim();
  const district = (req.query.district || '').trim();
  if (!district) {
    return res.status(400).json({ error: 'district is required.' });
  }

  let q = supabase
    .from('hubs')
    .select('id, hub_type, state, district, taluk, name, parent_hub_id, hub_incharge_id, lat, lng')
    .eq('district', district)
    .eq('is_active', true)
    .order('hub_type', { ascending: true }) // 'main' before 'taluk'
    .order('taluk', { ascending: true });
  if (state) q = q.eq('state', state);

  const { data, error } = await q;
  if (error) {
    console.error('GET /hubs error:', error.message);
    return res.status(500).json({ error: 'Could not load hubs.' });
  }
  res.json({ hubs: data || [] });
});

module.exports = router;
