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

const ACCOUNT_STATUSES = ['active', 'suspended', 'blocked'];

// Shared status-change logic: validates, updates, and records history.
async function changeUserStatus(adminId, targetId, newStatus, reason) {
  if (!ACCOUNT_STATUSES.includes(newStatus)) {
    return { code: 400, body: { error: `status must be one of: ${ACCOUNT_STATUSES.join(', ')}.` } };
  }
  if (newStatus === 'blocked' && (!reason || !reason.trim())) {
    return { code: 400, body: { error: 'A reason is required to block a user.' } };
  }

  const { data: target, error: fErr } = await supabase
    .from('users').select('id, fname, status').eq('id', targetId).single();
  if (fErr || !target) return { code: 404, body: { error: 'User not found.' } };
  if (target.status === newStatus) {
    return { code: 409, body: { error: `User is already ${newStatus}.` } };
  }

  const update = { status: newStatus, updated_at: new Date().toISOString() };
  if (newStatus === 'blocked') update.block_reason = reason.trim();
  if (newStatus === 'active')  update.block_reason = null;

  const { data, error } = await supabase
    .from('users').update(update).eq('id', targetId)
    .select('id, fname, status, block_reason').single();
  if (error) return { code: 500, body: { error: error.message } };

  await supabase.from('user_status_history').insert({
    user_id: targetId, old_status: target.status, new_status: newStatus,
    reason: reason && reason.trim() ? reason.trim() : null, changed_by: adminId,
  }).then(() => {}, () => {});

  return { code: 200, body: { message: `User status changed to ${newStatus}.`, user: data } };
}

// ── PATCH /users/:id/status ───────────────────────────────────────────────────
// Body: { status: 'active'|'suspended'|'blocked', reason }.  Reason required for block.
router.patch('/:id/status', requireRole('admin'), async (req, res) => {
  const result = await changeUserStatus(req.user.id, req.params.id, req.body.status, req.body.reason);
  res.status(result.code).json(result.body);
});

// ── GET /users/:id/status-history ─────────────────────────────────────────────
router.get('/:id/status-history', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('user_status_history')
    .select('id, old_status, new_status, reason, created_at, changer:users!user_status_history_changed_by_fkey (fname, lname, login_id)')
    .eq('user_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data || [] });
});

// ── PATCH /users/:id/block  &  /unblock  (kept for backward compatibility) ─────
router.patch('/:id/block', requireRole('admin'), async (req, res) => {
  const result = await changeUserStatus(req.user.id, req.params.id, 'blocked', req.body.reason);
  res.status(result.code).json(result.body);
});
router.patch('/:id/unblock', requireRole('admin'), async (req, res) => {
  const result = await changeUserStatus(req.user.id, req.params.id, 'active', req.body.reason);
  res.status(result.code).json(result.body);
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
    .select('*, user:users!profile_change_requests_user_id_fkey(subscription_plan, subscription_expires_at)')
    .eq('status', status)
    .order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const enriched = (data || []).map(r => ({
    ...r,
    subscription_plan:       r.user?.subscription_plan       || null,
    subscription_expires_at: r.user?.subscription_expires_at || null,
    user: undefined,
  }));
  res.json({ requests: enriched });
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

  const PLAN_DAYS = { 'Monthly': 30, 'Quarterly': 90, 'Half Yearly': 180, 'Yearly': 365 };

  if (cr.requested_changes && cr.requested_changes.subscription_renewal) {
    // ── Renewal step 1: set payment_pending, notify seller with amount ────────
    const renewalAmountRs = parseFloat(req.body.renewal_amount);
    if (!renewalAmountRs || renewalAmountRs <= 0) {
      return res.status(400).json({ error: 'renewal_amount (in rupees) is required to approve a renewal.' });
    }
    const plan          = cr.requested_changes.new_plan;
    const paymentRef    = 'RNW-' + require('crypto').randomBytes(4).toString('hex').toUpperCase();
    const amountPaise   = Math.round(renewalAmountRs * 100);

    const { error: upErr } = await supabase.from('profile_change_requests').update({
      status:            'payment_pending',
      reviewed_at:       now.toISOString(),
      reviewed_by:       req.user.id,
      reviewer_name:     req.user.fname,
      notes:             req.body.notes || null,
      payment_reference: paymentRef,
      renewal_amount:    amountPaise,
    }).eq('id', req.params.id);
    if (upErr) return res.status(500).json({ error: upErr.message });

    try {
      const { data: u } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).single();
      if (u) await notify.notifySubscriptionRenewalPaymentPending(u, plan, amountPaise, paymentRef);
    } catch(e) { console.error('Notify error:', e.message); }

    return res.json({ message: `Payment request sent to seller. Reference: ${paymentRef}`, payment_reference: paymentRef });
  }

  // ── Regular profile change (bank/business fields) ─────────────────────────
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
    if (u) {
      if (cr.requested_changes && cr.requested_changes.subscription_renewal) {
        await notify.notifySubscriptionRenewalOutcome(u, false, null, cr.requested_changes.new_plan);
      } else {
        await notify.notifyProfileChangeOutcome(u, 'rejected', req.body.notes, req.user.fname);
      }
    }
  } catch(e) { console.error('Notify error:', e.message); }

  res.json({ message: 'Change request rejected.' });
});

// ── POST /users/change-requests/:id/confirm-renewal-payment ──────────────────
router.post('/change-requests/:id/confirm-renewal-payment', requireRole('admin'), async (req, res) => {
  if (!isHeadOffice(req.user)) {
    return res.status(403).json({ error: 'Head Office access required.' });
  }
  const { data: cr } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (!cr) return res.status(404).json({ error: 'Change request not found.' });
  if (!cr.requested_changes || !cr.requested_changes.subscription_renewal) {
    return res.status(400).json({ error: 'This is not a renewal request.' });
  }
  if (cr.status !== 'payment_pending') {
    return res.status(409).json({ error: `Expected payment_pending status, got '${cr.status}'.` });
  }

  const PLAN_DAYS = { 'Monthly': 30, 'Quarterly': 90, 'Half Yearly': 180, 'Yearly': 365 };
  const plan     = cr.requested_changes.new_plan;
  const planDays = PLAN_DAYS[plan] || 365;
  const now      = new Date();

  const { data: currentUser } = await supabase.from('users').select('subscription_expires_at').eq('id', cr.user_id).single();
  const currentExp = currentUser?.subscription_expires_at ? new Date(currentUser.subscription_expires_at) : null;
  const baseDate   = (currentExp && currentExp > now) ? currentExp : now;
  const newExpiry  = new Date(baseDate);
  newExpiry.setDate(newExpiry.getDate() + planDays);

  const { error: upErr } = await supabase.from('users').update({
    subscription_plan:        plan,
    subscription_expires_at:  newExpiry.toISOString(),
    subscription_amount:      cr.renewal_amount || 0,
    status:                   'active',
    updated_at:               now.toISOString(),
  }).eq('id', cr.user_id);
  if (upErr) return res.status(500).json({ error: upErr.message });

  await supabase.from('profile_change_requests').update({
    status:               'approved',
    payment_confirmed_at: now.toISOString(),
  }).eq('id', req.params.id);

  try {
    const { data: u } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).single();
    if (u) await notify.notifySubscriptionRenewalOutcome(u, true, newExpiry.toISOString(), plan);
  } catch(e) { console.error('Notify error:', e.message); }

  res.json({ message: `Renewal confirmed. ${plan} subscription active until ${newExpiry.toDateString()}.` });
});

// ── GET /users/:id/listings  (admin only — farmer/retailer product listings) ──
router.get('/:id/listings', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('farmer_listings')
    .select(`
      id, farmer_price, qty_available, listing_status, rejection_reason, created_at,
      product:products ( id, name, code, unit, product_group )
    `)
    .eq('farmer_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ listings: data || [] });
});

// ── GET /users/:id ────────────────────────────────────────────────────────────
router.get('/:id', requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id,login_id,fname,lname,phone,alt_phone,email,role,admin_role,seller_type,gender,status,approval_status,district,state,village_town,city,pincode,street1,street2,house_no,landmark,bank_name,bank_account,ifsc,gst_number,business_name,business_type,aadhar,subscription_expires_at,subscription_plan,subscription_amount,created_at,updated_at')
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
  'subscription_expires_at', 'subscription_plan',
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
