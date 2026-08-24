const express = require('express');
const supabase = require('../db/supabase');
const { requirePermission, scopeFor } = require('../middleware/permissions');
const notify = require('../utils/notify');
const { validateStaffEmployment } = require('../utils/employeeValidation');
const { geocodeAddress, geocodingEnabled } = require('../utils/geocode');

// Address columns that, when an admin edits them, may need a fresh geocoded pin.
const ADDRESS_KEYS = [
  'house_no', 'street1', 'street2', 'landmark',
  'village_town', 'city', 'taluk', 'district', 'state', 'pincode',
];

const router = express.Router();

// Roles that are geo-scoped to a district or region. Kept keyed on the (unchanged)
// admin_role string — it still identifies the tier and only ever NARROWS the list.
const DISTRICT_ROLES = new Set(['District Manager', 'VCO', 'Delivery Agent', 'Hub Incharge']);
const REGION_ROLES   = new Set(['Regional Manager']);

function scopeQuery(query, user) {
  if (DISTRICT_ROLES.has(user.admin_role)) {
    return query.eq('district', user.district);
  }
  if (REGION_ROLES.has(user.admin_role)) {
    return query.eq('state', user.state);
  }
  // State Head / Head Office / Admin see all
  return query;
}

// HR's user_management scope is 'employees': they may only act on STAFF logins
// (role = 'admin'), never on consumers/sellers. Full-scope roles (Admin, Board,
// Technical Head) pass unconditionally. Fail closed if the target can't be read.
async function withinUserScope(user, targetId) {
  if (scopeFor(user, 'user_management') !== 'employees') return true;
  const { data, error } = await supabase
    .from('users').select('role').eq('id', targetId).maybeSingle();
  if (error || !data) return false;
  return data.role === 'admin';
}

// ── GET /users ────────────────────────────────────────────────────────────────
router.get('/', requirePermission('user_management', 'view'), async (req, res) => {
  try {
    let q = supabase
      .from('users')
      .select('id,login_id,fname,lname,phone,role,admin_role,gender,district,state,village_town,country,hub_id,can_deliver,status,agent_vehicle,subscription_expires_at,subscription_plan,created_at')
      .is('deleted_at', null)          // removed staff are not in the user list
      .order('created_at', { ascending: false });

    q = scopeQuery(q, req.user);

    // HR only manages staff logins.
    if (scopeFor(req.user, 'user_management') === 'employees') q = q.eq('role', 'admin');

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

  // A removed account has no status to change — blocking or unblocking one is
  // meaningless, and would put a misleading row in their status history.
  const { data: target, error: fErr } = await supabase
    .from('users').select('id, fname, status').eq('id', targetId).is('deleted_at', null).maybeSingle();
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

  // reads-ok: best-effort history row; the status change above is already committed
  await supabase.from('user_status_history').insert({
    user_id: targetId, old_status: target.status, new_status: newStatus,
    reason: reason && reason.trim() ? reason.trim() : null, changed_by: adminId,
  }).then(() => {}, () => {});

  return { code: 200, body: { message: `User status changed to ${newStatus}.`, user: data } };
}

// ── PATCH /users/:id/status ───────────────────────────────────────────────────
// Body: { status: 'active'|'suspended'|'blocked', reason }.  Reason required for block.
router.patch('/:id/status', requirePermission('user_management', 'edit'), async (req, res) => {
  if (!(await withinUserScope(req.user, req.params.id))) {
    return res.status(403).json({ error: 'You may only manage staff accounts.' });
  }
  const result = await changeUserStatus(req.user.id, req.params.id, req.body.status, req.body.reason);
  res.status(result.code).json(result.body);
});

// ── GET /users/:id/status-history ─────────────────────────────────────────────
router.get('/:id/status-history', requirePermission('user_management', 'view'), async (req, res) => {
  const { data, error } = await supabase
    .from('user_status_history')
    .select('id, old_status, new_status, reason, created_at, changer:users!user_status_history_changed_by_fkey (fname, lname, login_id)')
    .eq('user_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ history: data || [] });
});

// ── GET /users/:id/audit-log ──────────────────────────────────────────────────
// Full record-change history from the DB audit trigger. Audit Logs: Board / Admin /
// Technical Head (per the RBAC matrix — State Head no longer sees audit).
router.get('/:id/audit-log', requirePermission('audit_logs', 'view'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { data, error } = await supabase
    .from('user_audit_log')
    .select('id, action, changed_fields, row_snapshot, changed_at, changed_by')
    .eq('user_id', req.params.id)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ audit: data || [] });
});

// ── GET /users/:id/login-history ──────────────────────────────────────────────
// Login attempts (success + failure) for this user. Audit Logs permission.
router.get('/:id/login-history', requirePermission('audit_logs', 'view'), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const { data, error } = await supabase
    .from('user_login_history')
    .select('id, method, success, outcome, ip_address, user_agent, created_at')
    .eq('user_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ logins: data || [] });
});

// ── PATCH /users/:id/block  &  /unblock  (kept for backward compatibility) ─────
router.patch('/:id/block', requirePermission('user_management', 'edit'), async (req, res) => {
  if (!(await withinUserScope(req.user, req.params.id))) {
    return res.status(403).json({ error: 'You may only manage staff accounts.' });
  }
  const result = await changeUserStatus(req.user.id, req.params.id, 'blocked', req.body.reason);
  res.status(result.code).json(result.body);
});
router.patch('/:id/unblock', requirePermission('user_management', 'edit'), async (req, res) => {
  if (!(await withinUserScope(req.user, req.params.id))) {
    return res.status(403).json({ error: 'You may only manage staff accounts.' });
  }
  const result = await changeUserStatus(req.user.id, req.params.id, 'active', req.body.reason);
  res.status(result.code).json(result.body);
});

// ── GET /users/change-requests ────────────────────────────────────────────────
// Approving a seller's bank/GST/renewal change writes financial fields, so it is
// the seller_management 'approve' authority (Admin) — not the 'manage' the tiered
// managers hold. Listing shares the same gate: you only queue what you can decide.
router.get('/change-requests', requirePermission('seller_management', 'approve'), async (req, res) => {
  const status = req.query.status || 'pending';
  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('*, user:users!profile_change_requests_user_id_fkey(subscription_plan, subscription_expires_at, district)')
    .eq('status', status)
    .order('requested_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const enriched = (data || []).map(r => ({
    ...r,
    subscription_plan:       r.user?.subscription_plan       || null,
    subscription_expires_at: r.user?.subscription_expires_at || null,
    // The seller's district, for the admin console's geo filter.
    district:                r.user?.district                || null,
    user: undefined,
  }));
  res.json({ requests: enriched });
});

// ── POST /users/change-requests/:id/approve ───────────────────────────────────
router.post('/change-requests/:id/approve', requirePermission('seller_management', 'approve'), async (req, res) => {
  const { data: cr, error: crErr } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (crErr || !cr) return res.status(404).json({ error: 'Change request not found.' });
  if (cr.status !== 'pending') return res.status(409).json({ error: 'Request already reviewed.' });

  const now = new Date();
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
      const { data: u, error: uErr } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).maybeSingle();
      if (uErr) console.error(`Could not load user ${cr.user_id} to notify them; no message was sent:`, uErr.message);
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

  // Mark request approved. The bank/GST change above is ALREADY applied to the
  // user, so a failure here cannot be reported as an approval failure — it would
  // be a lie in the other direction. But it must not be silent either: unread, the
  // request stayed 'pending' forever while the change it asked for was live.
  const { error: markErr } = await supabase.from('profile_change_requests').update({
    status: 'approved',
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.user.id,
    reviewer_name: req.user.fname,
    notes: req.body.notes || null,
  }).eq('id', req.params.id);
  if (markErr) {
    console.error(`Change request ${req.params.id}: changes APPLIED to user ${cr.user_id} but the ` +
                  `request could not be marked approved — it will still show as pending: ${markErr.message}`);
  }

  // Notify user
  try {
    const { data: u, error: uErr } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).maybeSingle();
    if (uErr) console.error(`Could not load user ${cr.user_id} to notify them; no message was sent:`, uErr.message);
    if (u) await notify.notifyProfileChangeOutcome(u, 'approved', req.body.notes, req.user.fname);
  } catch(e) { console.error('Notify error:', e.message); }

  res.json({ message: 'Change request approved and applied.' });
});

// ── POST /users/change-requests/:id/reject ────────────────────────────────────
router.post('/change-requests/:id/reject', requirePermission('seller_management', 'approve'), async (req, res) => {
  const { data: cr, error: crErr } = await supabase
    .from('profile_change_requests').select('*').eq('id', req.params.id).maybeSingle();
  if (crErr) return res.status(500).json({ error: 'Could not load the change request. Please try again.' });
  if (!cr) return res.status(404).json({ error: 'Change request not found.' });
  if (cr.status !== 'pending') return res.status(409).json({ error: 'Request already reviewed.' });

  // The rejection has to LAND. Unread, a failed update still told the admin
  // "rejected" and still emailed the seller their rejection — while the request sat
  // in the queue as pending, ready to be rejected all over again.
  const { error: rejectErr } = await supabase.from('profile_change_requests').update({
    status: 'rejected',
    reviewed_at: new Date().toISOString(),
    reviewed_by: req.user.id,
    reviewer_name: req.user.fname,
    notes: req.body.notes || null,
  }).eq('id', req.params.id);
  if (rejectErr) return res.status(500).json({ error: 'Could not record the rejection. Please try again.' });

  try {
    const { data: u, error: uErr } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).maybeSingle();
    if (uErr) console.error(`Could not load user ${cr.user_id} to notify them; no message was sent:`, uErr.message);
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
router.post('/change-requests/:id/confirm-renewal-payment', requirePermission('seller_management', 'approve'), async (req, res) => {
  const { data: cr, error: crErr } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('id', req.params.id)
    .maybeSingle();
  if (crErr) return res.status(500).json({ error: 'Could not load the change request. Please try again.' });
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

  // This read decides whether the renewal EXTENDS the seller's remaining time or
  // restarts from today. Unread, a failure took the `?? null` path below, silently
  // rebasing the expiry to now — a seller who renewed early simply lost whatever
  // days they had left, and paid for the privilege.
  const { data: currentUser, error: currentUserErr } = await supabase
    .from('users').select('subscription_expires_at').eq('id', cr.user_id).maybeSingle();
  if (currentUserErr) {
    return res.status(500).json({ error: 'Could not read the current subscription. Please try again.' });
  }
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

  // As above: the subscription is already extended and the seller reactivated, so
  // this cannot fail the request. It can only refuse to be invisible — otherwise
  // the renewal stays 'payment_pending' and looks unpaid to the next admin.
  const { error: markErr } = await supabase.from('profile_change_requests').update({
    status:               'approved',
    payment_confirmed_at: now.toISOString(),
  }).eq('id', req.params.id);
  if (markErr) {
    console.error(`Renewal ${req.params.id}: subscription EXTENDED for user ${cr.user_id} but the ` +
                  `request could not be marked approved — it will still show as payment_pending: ${markErr.message}`);
  }

  try {
    const { data: u, error: uErr } = await supabase.from('users').select('fname,lname,email,login_id').eq('id', cr.user_id).maybeSingle();
    if (uErr) console.error(`Could not load user ${cr.user_id} to notify them; no message was sent:`, uErr.message);
    if (u) await notify.notifySubscriptionRenewalOutcome(u, true, newExpiry.toISOString(), plan);
  } catch(e) { console.error('Notify error:', e.message); }

  res.json({ message: `Renewal confirmed. ${plan} subscription active until ${newExpiry.toDateString()}.` });
});

// ── GET /users/:id/listings  (a seller's product listings) ────────────────────
router.get('/:id/listings', requirePermission('seller_management', 'view'), async (req, res) => {
  const { data, error } = await supabase
    .from('farmer_listings')
    .select(`
      id, farmer_price, qty_available, listing_status, created_at,
      product:products ( id, name, code, unit, product_group )
    `)
    .eq('farmer_id', req.params.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ listings: data || [] });
});

// ── GET /users/:id ────────────────────────────────────────────────────────────
router.get('/:id', requirePermission('user_management', 'view'), async (req, res) => {
  if (!(await withinUserScope(req.user, req.params.id))) {
    return res.status(403).json({ error: 'You may only view staff accounts.' });
  }
  const { data, error } = await supabase
    .from('users')
    .select('id,login_id,fname,lname,phone,country_code,alt_phone,email,role,admin_role,seller_type,gender,status,approval_status,district,state,country,village_town,city,taluk,pincode,street1,street2,house_no,landmark,hub_id,can_deliver,bank_name,bank_account,ifsc,gst_number,business_name,business_type,aadhar,emp_id,employment_type,agent_vehicle,subscription_expires_at,subscription_plan,subscription_amount,created_at,updated_at')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: data });
});

// ── PATCH /users/:id ──────────────────────────────────────────────────────────
// Direct profile edit — user_management 'edit' (Admin; HR limited to staff logins).
const ADMIN_EDITABLE = [
  'fname', 'lname', 'email', 'alt_phone', 'gender', 'phone',
  'house_no', 'street1', 'street2', 'landmark', 'village_town', 'city', 'taluk', 'district', 'pincode', 'state',
  'bank_name', 'bank_account', 'ifsc',
  'gst_number', 'business_name', 'business_type',
  'aadhar', 'agent_vehicle', 'emp_id', 'employment_type',
  'subscription_expires_at', 'subscription_plan',
];

router.patch('/:id', requirePermission('user_management', 'edit'), async (req, res) => {
  if (!(await withinUserScope(req.user, req.params.id))) {
    return res.status(403).json({ error: 'You may only edit staff accounts.' });
  }
  const updates = {};
  for (const key of ADMIN_EDITABLE) {
    if (req.body[key] !== undefined) updates[key] = req.body[key] || null;
  }

  // can_deliver is a boolean capability (a VCO who also does nearby delivery), so
  // it can't go through the `|| null` coercion above — false is a real value, not
  // "unset". Only a VCO may carry it; the DB has the same check as a backstop.
  if (req.body.can_deliver !== undefined) {
    const wants = req.body.can_deliver === true || req.body.can_deliver === 'true';
    if (wants) {
      const { data: tgt, error: tgtErr } = await supabase
        .from('users').select('admin_role').eq('id', req.params.id).maybeSingle();
      if (tgtErr) return res.status(500).json({ error: 'Could not verify this account before updating it. Please try again.' });
      if (!tgt || tgt.admin_role !== 'VCO') {
        return res.status(400).json({ error: 'Only a VCO can be enabled as a nearby Delivery Agent.' });
      }
    }
    updates.can_deliver = wants;
  }

  // Home hub — the office a VCO / Delivery Agent / Hub Incharge / Hub Manager is
  // assigned to. Admin/HR own this (the staff member sees it read-only); their
  // profile office address is this hub's address, and delivery routing scopes to it.
  // null clears it; a present value must be a real hub (a bad id would be a Postgres
  // FK 500, not a clean 400).
  if (req.body.hub_id !== undefined) {
    if (req.body.hub_id === null || req.body.hub_id === '') {
      updates.hub_id = null;
    } else {
      const { data: hub, error: hubErr } = await supabase
        .from('hubs').select('id').eq('id', req.body.hub_id).maybeSingle();
      if (hubErr) {
        console.error('admin hub_id lookup failed:', hubErr.message);
        return res.status(500).json({ error: 'Could not verify the selected hub.' });
      }
      if (!hub) return res.status(400).json({ error: 'That hub does not exist.' });
      updates.hub_id = req.body.hub_id;
    }
  }

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updatable fields provided.' });

  // village_town is canonical; keep the legacy vco_city (VCO order-matching) in sync.
  if (updates.village_town !== undefined) updates.vco_city = updates.village_town;

  // Employee tracker rule: Permanent staff must reference an active tracker record.
  if (updates.employment_type !== undefined || updates.emp_id !== undefined) {
    // Unread, a failed read left `cur` null and the `if (cur && …)` below went
    // false — skipping the employment validation AND the one-login-per-employee
    // check entirely. The guard did not reject; it evaporated.
    const { data: cur, error: curErr } = await supabase
      .from('users').select('role, emp_id, employment_type').eq('id', req.params.id).maybeSingle();
    if (curErr) {
      return res.status(500).json({ error: 'Could not verify this account before updating it. Please try again.' });
    }
    if (cur && cur.role === 'admin') {
      const check = await validateStaffEmployment({
        employment_type: updates.employment_type !== undefined ? updates.employment_type : cur.employment_type,
        emp_id:          updates.emp_id          !== undefined ? updates.emp_id          : cur.emp_id,
      });
      if (!check.ok) return res.status(400).json({ error: check.error });

      // One login per employee: don't let an Employee ID be moved onto this login
      // if another account already holds it.
      const newEmpId = (updates.emp_id !== undefined ? updates.emp_id : cur.emp_id);
      if (newEmpId && newEmpId !== cur.emp_id) {
        const { data: dupEmp, error: dupEmpErr } = await supabase
          .from('users').select('login_id').eq('emp_id', newEmpId).neq('id', req.params.id).limit(1);
        if (dupEmpErr) {
          return res.status(500).json({ error: 'Could not verify whether this Employee ID already has a login. Please try again.' });
        }
        if (dupEmp && dupEmp.length) {
          return res.status(409).json({ error: `Employee "${newEmpId}" already has a login (${dupEmp[0].login_id}). One employee can hold only one login account.` });
        }
      }
    }
  }

  // Address → map pin, best-effort. When an admin edits a SELLER's address and the
  // farm has no pin yet, geocode the merged address to fill farm_lat/lng (the pickup
  // origin on the tracking map) — the admin equivalent of the seller's own PATCH /me
  // fallback. Never overwrites a real pin; a geocode miss just leaves it unset.
  const adminAddressChanged = ADDRESS_KEYS.some((k) => updates[k] !== undefined);
  if (adminAddressChanged && geocodingEnabled()) {
    const { data: cur, error: curErr } = await supabase
      .from('users')
      .select('role, house_no, street1, street2, landmark, village_town, city, taluk, district, state, pincode, farm_lat, farm_lng')
      .eq('id', req.params.id)
      .maybeSingle();
    if (curErr) {
      console.error('PATCH /users farm geocode read failed:', curErr.message);
    } else if (cur && cur.role === 'farmer' && cur.farm_lat == null && cur.farm_lng == null) {
      const geo = await geocodeAddress({ ...cur, ...updates });
      if (geo) {
        updates.farm_lat = geo.lat;
        updates.farm_lng = geo.lng;
      }
    }
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', req.params.id)
    .is('deleted_at', null)
    .select()
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(404).json({ error: 'User not found, or the account has been removed.' });
  res.json({ message: 'User profile updated.', user: data });
});

module.exports = router;
