const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can, requirePermission } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// The kinds of field visit a farmer relationship involves. Kept as a closed list so
// the dashboard can group by it later and the client can localise each label.
const VISIT_PURPOSES = ['collection', 'onboarding', 'quality_check', 'grievance', 'payment', 'other'];

const createSchema = z.object({
  // Not z.uuid() — that rejects non-RFC-variant ids (a known trap here), and the
  // farmer lookup below is the real gate: a bad id 404s rather than 400s.
  farmer_id: z.string().trim().min(1),
  purpose: z.enum(VISIT_PURPOSES),
  // A short field note. Bounded so a runaway paste can't bloat the row.
  notes: z.string().trim().max(1000).optional(),
});

// The same area-scoping the farmer list uses (routes/farmers.js): a district-tier
// staffer sees their district, a Regional Manager their state, State Head / Head
// Office everything. Keeping the two in step means "the farmers I manage" and "the
// visits I can see" always describe the same area.
const DISTRICT_ROLES = new Set(['District Manager', 'VCO', 'Delivery Agent', 'Hub Incharge', 'Hub Manager']);
const REGION_ROLES = new Set(['Regional Manager']);

const fullName = (u) => `${u?.fname || ''}${u?.lname ? ' ' + u.lname : ''}`.trim();

// ── POST /farmer-visits ── log a visit to a farmer ───────────────────────────────
// Any role that may create in farmer_management (VCO, the manager tiers, Admin). The
// farmer is looked up so the visit carries a trustworthy district + names, and so a
// visit can't be logged against a consumer id or a stranger.
router.post('/', requirePermission('farmer_management', 'create'), validateBody(createSchema), async (req, res) => {
  const { farmer_id, purpose, notes } = req.body;

  const { data: farmer, error: ferr } = await supabase
    .from('users')
    .select('id, role, fname, lname, district')
    .eq('id', farmer_id)
    .maybeSingle();
  if (ferr) {
    console.error('POST /farmer-visits farmer lookup error:', ferr.message);
    return res.status(500).json({ error: 'Could not log the visit. Please try again.' });
  }
  if (!farmer || farmer.role !== 'farmer') {
    return res.status(404).json({ error: 'No such farmer.' });
  }

  const row = {
    farmer_id: farmer.id,
    farmer_name: fullName(farmer) || null,
    visited_by: req.user.id,
    visited_by_name: fullName(req.user) || null,
    purpose,
    notes: notes || null,
    district: farmer.district || null,
    visited_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from('farmer_visits').insert(row).select().single();
  if (error) {
    console.error('POST /farmer-visits insert error:', error.message);
    return res.status(500).json({ error: 'Could not log the visit. Please try again.' });
  }
  res.status(201).json({ visit: data });
});

// ── GET /farmer-visits ── the review list, area-scoped ───────────────────────────
// Optional ?farmer_id (one farmer's history), ?district (only an unscoped role may
// narrow), ?limit (default 50, max 200).
router.get('/', requirePermission('farmer_management', 'view'), async (req, res) => {
  const u = req.user;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

  let q = supabase
    .from('farmer_visits')
    .select('id, farmer_id, farmer_name, visited_by, visited_by_name, purpose, notes, district, visited_at')
    .order('visited_at', { ascending: false })
    .limit(limit);

  if (DISTRICT_ROLES.has(u.admin_role)) {
    q = q.eq('district', u.district || '\u0000'); // unassigned district → match nothing
  } else if (REGION_ROLES.has(u.admin_role)) {
    const { data: locs, error: lerr } = await supabase.from('locations').select('district').eq('state', u.state);
    if (lerr) {
      console.error('GET /farmer-visits region scope error:', lerr.message);
      return res.status(500).json({ error: 'Could not scope visits to your region.' });
    }
    q = q.in('district', (locs || []).map((l) => l.district));
  } else if (req.query.district) {
    // State Head / Head Office may narrow to one district via the console filter.
    q = q.eq('district', req.query.district);
  }

  if (req.query.farmer_id) q = q.eq('farmer_id', req.query.farmer_id);

  const { data, error } = await q;
  if (error) {
    console.error('GET /farmer-visits error:', error.message);
    return res.status(500).json({ error: 'Could not load farmer visits.' });
  }
  res.json({ visits: data || [] });
});

module.exports = router;
