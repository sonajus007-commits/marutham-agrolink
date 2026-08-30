const express = require('express');
const crypto  = require('crypto');
const supabase = require('../db/supabase');
const { requirePermission } = require('../middleware/permissions');
const notify = require('../utils/notify');
const { notify: notifyInApp } = require('../utils/notifications');

const router = express.Router();

// Seller onboarding queue: reviewing and approving a new seller's registration is
// part of managing sellers. Managers hold seller_management 'manage' (which
// includes edit) in their geo, so they keep approving registrations in their area;
// Admin has full control. Gated on 'edit' — the in-handler geo filter below still
// scopes each manager to their district/region.
router.use(requirePermission('seller_management', 'edit'));

function generatePaymentRef() {
  return 'PAY-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// ── GET /registrations ─────────────────────────────────────────────────────────
// ?status=pending_review|payment_pending|active|rejected|all  (default: pending_review)
router.get('/', async (req, res) => {
  const status = req.query.status || 'pending_review';

  let query = supabase
    .from('users')
    .select('id, login_id, fname, lname, phone, email, role, seller_type, gender, district, state, village_town, approval_status, approved_at, rejection_reason, subscription_amount, subscription_expires_at, subscription_plan, payment_reference, payment_confirmed_at, created_at, business_name, gst_number, business_type, aadhar, bank_name, bank_account, ifsc')
    .eq('role', 'farmer')
    .order('created_at', { ascending: false });

  // Scope by admin's district/region
  if (req.user.admin_role === 'District Manager') {
    query = query.eq('district', req.user.district);
  } else if (req.user.admin_role === 'Regional Manager') {
    query = query.eq('state', req.user.state);
  } else if (req.user.admin_role === 'State Head') {
    query = query.eq('state', req.user.state);
  }

  if (status !== 'all') {
    query = query.eq('approval_status', status);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: 'Could not fetch registrations.' });

  res.json({ registrations: data || [] });
});

// ── GET /registrations/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, login_id, fname, lname, phone, email, role, seller_type, gender, district, state, village_town, city, taluk, pincode, house_no, street1, street2, landmark, approval_status, approved_by, approved_at, rejection_reason, subscription_amount, subscription_expires_at, subscription_plan, payment_reference, payment_confirmed_at, created_at, business_name, gst_number, business_type, aadhar, bank_name, bank_account, ifsc, alt_phone')
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Registration not found.' });
  res.json({ registration: data });
});

// ── POST /registrations/:id/approve ───────────────────────────────────────────
// Approving activates the seller's LOGIN and moves them to 'suspended': they can
// log in but are restricted to the subscription payment screen until they pick a
// plan and pay (plan fee + one-time ₹100 registration charge). No amount needed
// here — the seller selects their plan themselves.
router.post('/:id/approve', async (req, res) => {
  const { data: applicant, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .single();

  if (fetchErr || !applicant) return res.status(404).json({ error: 'Registration not found.' });
  if (applicant.approval_status !== 'pending_review') {
    return res.status(409).json({ error: `Registration is already in '${applicant.approval_status}' status.` });
  }

  const nowIso = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('users')
    .update({
      approval_status: 'approved',
      status:          'suspended',   // login allowed, payment screen only
      approved_by:     req.user.id,
      approved_at:     nowIso,
      updated_at:      nowIso,
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateErr) {
    console.error('Approve error:', updateErr);
    return res.status(500).json({ error: 'Could not approve registration.' });
  }

  // reads-ok: best-effort audit row; the approval above is already committed
  await supabase.from('user_status_history').insert({
    user_id: req.params.id, old_status: applicant.status, new_status: 'suspended',
    reason: 'Registration approved — awaiting subscription payment', changed_by: req.user.id,
  }).then(() => {}, () => {});

  try {
    await notify.notifyApprovalWithPayment(updated);
  } catch (e) {
    console.error('Notification error (approve):', e.message);
  }
  notifyInApp(req.params.id, {
    type: 'registration_approved',
    title: 'Registration approved',
    body: 'Your registration is approved. Sign in and activate your account to start selling.',
  });

  res.json({
    message: `Registration approved. ${applicant.fname} can now log in and pay to activate their account.`,
    registration: updated,
  });
});

// ── POST /registrations/:id/reject ────────────────────────────────────────────
// Body: { reason }
router.post('/:id/reject', async (req, res) => {
  const { reason } = req.body;
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A rejection reason is required.' });
  }

  const { data: applicant, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .single();

  if (fetchErr || !applicant) return res.status(404).json({ error: 'Registration not found.' });
  if (applicant.approval_status === 'active') {
    return res.status(409).json({ error: 'Cannot reject an already-active account.' });
  }

  const { error: updateErr } = await supabase
    .from('users')
    .update({
      approval_status:  'rejected',
      rejection_reason: reason.trim(),
      updated_at:       new Date().toISOString(),
    })
    .eq('id', req.params.id);

  if (updateErr) return res.status(500).json({ error: 'Could not reject registration.' });

  try {
    await notify.notifyRejection(applicant, reason.trim());
  } catch (e) {
    console.error('Notification error (reject):', e.message);
  }
  notifyInApp(req.params.id, {
    type: 'registration_rejected',
    title: 'Registration update',
    body: `Your registration could not be approved: ${reason.trim()}`,
  });

  res.json({ message: `Registration rejected. Applicant has been notified.` });
});

// ── POST /registrations/:id/confirm-payment ───────────────────────────────────
// Called by admin after verifying payment in bank statement
router.post('/:id/confirm-payment', async (req, res) => {
  const { data: applicant, error: fetchErr } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .single();

  if (fetchErr || !applicant) return res.status(404).json({ error: 'Registration not found.' });
  if (applicant.approval_status !== 'payment_pending') {
    return res.status(409).json({ error: `Registration must be in 'payment_pending' status to confirm payment. Current: '${applicant.approval_status}'.` });
  }

  const { data: activated, error: updateErr } = await supabase
    .from('users')
    .update({
      approval_status:      'active',
      status:               'active',
      payment_confirmed_at: new Date().toISOString(),
      updated_at:           new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateErr) return res.status(500).json({ error: 'Could not activate account.' });

  try {
    await notify.notifyAccountActivated(activated);
  } catch (e) {
    console.error('Notification error (activate):', e.message);
  }

  res.json({
    message: `Account activated. Login credentials sent to ${applicant.fname}.`,
    registration: activated,
  });
});

module.exports = router;
