const express = require('express');
const supabase = require('../db/supabase');
const { requireRole } = require('../middleware/auth');
const notify = require('../utils/notify');

const router = express.Router();

function isHeadOffice(user) {
  return user.admin_role === 'Head Office' || user.admin_role === 'State Head';
}

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
      .select('id,login_id,fname,lname,phone,role,admin_role,gender,district,state,status,agent_vehicle,subscription_expires_at,subscription_plan,created_at')
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

// ── GET /users/change-requests ────────────────────────────────────────────────
// Head Office only — list pending profile change requests
router.get('/change-requests', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required.' });
  }
  const status = req.query.status || 'pending';
  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('status', status)
    .order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: data || [] });
});

// ── POST /users/change-requests/:id/approve ───────────────────────────────────
router.post('/change-requests/:id/approve', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required.' });
  }
  const { data: cr, error: crErr } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (crErr || !cr) return res.status(404).json({ error: 'Change request not found.' });
  if (cr.status !== 'pending') return res.status(409).json({ error: 'Request already reviewed.' });

  // Apply changes to user profile
  const { error: upErr } = await supabase
    .from('users')
    .update({ ...cr.requested_changes, updated_at: new Date().toISOString() })
    .eq('id', cr.user_id);
  if (upErr) return res.status(500).json({ error: upErr.message });

  // Mark request approved
  await supabase.from('profile_change_requests').update({
    status: 'approved',
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.user.id,
    reviewer_name: req.user.fname,
    notes: req.body.notes || null,
  }).eq('id', req.params.id);

  // Notify user
  try {
    const { data: u } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).single();
    if (u) await notify.notifyProfileChangeOutcome(u, 'approved', req.body.notes, req.user.fname);
  } catch(e) { console.error('Notify error:', e.message); }

  res.json({ message: 'Change request approved and applied.' });
});

// ── POST /users/change-requests/:id/reject ────────────────────────────────────
router.post('/change-requests/:id/reject', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required.' });
  }
  const { data: cr } = await supabase.from('profile_change_requests').select('*').eq('id', req.params.id).single();
  if (!cr) return res.status(404).json({ error: 'Change request not found.' });
  if (cr.status !== 'pending') return res.status(409).json({ error: 'Request already reviewed.' });

  await supabase.from('profile_change_requests').update({
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.user.id,
    reviewer_name: req.user.fname,
    notes: req.body.notes || null,
  }).eq('id', req.params.id);

  try {
    const { data: u } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).single();
    if (u) await notify.notifyProfileChangeOutcome(u, 'rejected', req.body.notes, req.user.fname);
  } catch(e) { console.error('Notify error:', e.message); }

  res.json({ message: 'Change request rejected.' });
});

// ── GET /users/:id ────────────────────────────────────────────────────────────
router.get('/:id', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id,login_id,fname,lname,phone,alt_phone,email,role,admin_role,seller_type,gender,status,approval_status,district,state,village_town,city,pincode,street1,street2,house_no,landmark,bank_name,bank_account,ifsc,gst_number,business_name,business_type,aadhar,subscription_expires_at,subscription_amount,created_at,updated_at')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: data });
});

// ── PATCH /users/:id ──────────────────────────────────────────────────────────
// Admin direct edit — Head Office can update any field; others limited
const ADMIN_EDITABLE = [
  'fname', 'lname', 'email', 'alt_phone', 'gender', 'phone',
  'house_no', 'street1', 'street2', 'landmark', 'village_town', 'city', 'district', 'pincode', 'state',
  'bank_name', 'bank_account', 'ifsc',
  'gst_number', 'business_name', 'business_type',
  'aadhar', 'agent_vehicle',
  'subscription_expires_at',
];

router.patch('/:id', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required to edit user profiles.' });
  }
  const updates = {};
  for (const key of ADMIN_EDITABLE) {
    if (req.body[key] !== undefined) updates[key] = req.body[key] || null;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: 'User profile updated.', user: data });
});

module.exports = router;
