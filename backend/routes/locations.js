const express = require('express');
const supabase = require('../db/supabase');

const router = express.Router();

// Public reference data — the pre-login registration form needs it too, so no auth.
// Returns a cascading tree: { "Tamil Nadu": { "Ariyalur": ["Ariyalur", ...] } }
let _cache = null;
let _cacheAt = 0;
const CACHE_MS = 60 * 60 * 1000; // 1h — this data rarely changes

async function fetchAll() {
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('locations')
      .select('state, district, taluk')
      .order('state').order('district').order('taluk')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

router.get('/', async (req, res) => {
  try {
    if (_cache && Date.now() - _cacheAt < CACHE_MS) return res.json({ tree: _cache });
    const rows = await fetchAll();
    const tree = {};
    for (const r of rows) {
      (tree[r.state] || (tree[r.state] = {}));
      (tree[r.state][r.district] || (tree[r.state][r.district] = []));
      tree[r.state][r.district].push(r.taluk);
    }
    _cache = tree; _cacheAt = Date.now();
    res.json({ tree });
  } catch (e) {
    console.error('GET /locations error:', e.message);
    res.status(500).json({ error: 'Could not load locations.' });
  }
});

module.exports = router;
