const express = require('express');
const supabase = require('../db/supabase');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

// Roles that are scoped to a district, region, or state
const DISTRICT_ROLES = new Set(['District Manager', 'VCO', 'Delivery Agent', 'Hub Incharge']);
const REGION_ROLES   = new Set(['Regional Manager']);

function scopeQuery(query, user) {
  if (DISTRICT_ROLES.has(user.admin_role)) {
    return query.eq('district', user.district);
  }
  if (REGION_ROLES.has(user.admin_role)) {
    return query.eq('state', user.state);
  }
  // State Head / Head Office see all
  return query;
}

// ── GET /users ────────────────────────────────────────────────────────────────
router.get('/', requireRole('admin'), async (req, res) => {
  try {
    let q = supabase
      .from('users')
      .select('id,login_id,fname,lname,phone,role,admin_role,gender,district,state,status,agent_vehicle,created_at')
      .order('created_at', { ascending: false });

    q = scopeQuery(q, req.user);

    if (req.query.admin_role) q = q.eq('admin_role', req.query.admin_role);
    if (req.query.district)   q = q.eq('district',   req.query.district);
    if (req.query.role)       q = q.eq('role',        req.query.role);

    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ users: data || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /users/:id/block ────────────────────────────────────────────────────
router.patch('/:id/block', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('users')
    .update({ status: 'blocked', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,fname')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'User blocked.', user: data });
});

// ── PATCH /users/:id/unblock ──────────────────────────────────────────────────
router.patch('/:id/unblock', requireRole('admin'), async (req, res) => {
  const { id } = req.params;
  const { data, error } = await supabase
    .from('users')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id,fname')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'User unblocked.', user: data });
});

module.exports = router;
