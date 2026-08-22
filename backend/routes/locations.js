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

// ── GET /locations/villages?state=&district=&taluk= ─────────────────────────────
// Learned autocomplete for the merged Village/Town/City field: the distinct
// localities users have ALREADY entered in this taluk. There is no village master
// (deliberately — see migration 017); delivery routes on pincode + taluk + the GPS
// pin, so this self-populating list gives dropdown-like help at zero data cost.
// Public (the pre-login registration form uses it). Village names are public place
// names, never tied back to a user.
router.get('/villages', async (req, res) => {
  const state = String(req.query.state || '').trim();
  const district = String(req.query.district || '').trim();
  const taluk = String(req.query.taluk || '').trim();
  if (!state || !district || !taluk) {
    return res.status(400).json({ error: 'state, district and taluk are required.' });
  }
  try {
    // Both the canonical village_town and the legacy city column are hints. A guard
    // whose query fails must FAIL, not wave through an empty list as if the taluk
    // had no villages.
    const { data, error } = await supabase
      .from('users')
      .select('village_town, city')
      .eq('state', state)
      .eq('district', district)
      .eq('taluk', taluk)
      .limit(2000);
    if (error) throw error;

    const seen = new Map(); // lowercased → first-seen original casing (dedupe variants)
    for (const row of data || []) {
      for (const raw of [row.village_town, row.city]) {
        const v = (raw || '').trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (!seen.has(key)) seen.set(key, v);
      }
    }
    const villages = [...seen.values()].sort((a, b) => a.localeCompare(b)).slice(0, 50);
    res.json({ villages });
  } catch (e) {
    console.error('GET /locations/villages error:', e.message);
    res.status(500).json({ error: 'Could not load village suggestions.' });
  }
});

module.exports = router;
