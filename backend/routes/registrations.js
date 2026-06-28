const express = require('express');
const crypto  = require('crypto');
const supabase = require('../db/supabase');
const { requireAuth, requireRole } = require('../middleware/auth');
const notify = require('../utils/notify');

const router = express.Router();

// All endpoints require admin auth
router.use(requireRole('admin'));

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
    .select('id, login_id, fname, lname, phone, email, role, seller_type, gender, district, state, village_town, city, pincode, house_no, street1, street2, landmark, approval_status, approved_by, approved_at, rejection_reason, subscription_amount, subscription_expires_at, subscription_plan, payment_reference, payment_confirmed_at, created_at, business_name, gst_number, business_type, aadhar, bank_name, bank_account, ifsc, alt_phone')
    .eq('id', req.params.id)
    .eq('role', 'farmer')
    .single();

  if (error || !data) return res.status(404).json({ error: 'Registration not found.' });
  res.json({ registration: data });
});

// ── POST /registrations/:id/approve ───────────────────────────────────────────
// Body: { subscription_amount }  (in rupees, will convert to paise)
router.post('/:id/approve', async (req, res) => {
  const amountRs = parseFloat(req.body.subscription_amount);
  if (!amountRs || amountRs <= 0) {
    return res.status(400).json({ error: 'subscription_amount (in rupees) is required and must be > 0.' });
  }

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

  const PLAN_DAYS = { 'Monthly': 30, 'Quarterly': 90, 'Half Yearly': 180, 'Yearly': 365 };
  const paymentRef   = generatePaymentRef();
  const amountPaise  = Math.round(amountRs * 100);
  const planDays     = PLAN_DAYS[applicant.subscription_plan] || 365;
  const expiresAt    = new Date();
  expiresAt.setDate(expiresAt.getDate() + planDays);

  const { data: updated, error: updateErr } = await supabase
    .from('users')
    .update({
      approval_status:        'payment_pending',
      approved_by:             req.user.id,
      approved_at:             new Date().toISOString(),
      subscription_amount:     amountPaise,
      subscription_expires_at: expiresAt.toISOString(),
      payment_reference:       paymentRef,
      updated_at:              new Date().toISOString(),
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (updateErr) {
    console.error('Approve error:', updateErr);
    return res.status(500).json({ error: 'Could not approve registration.' });
  }

  try {
    await notify.notifyApprovalWithPayment(updated, amountPaise);
  } catch (e) {
    console.error('Notification error (approve):', e.message);
  }

  res.json({
    message: `Registration approved. Payment notification sent to ${applicant.fname}.`,
    payment_reference: paymentRef,
    subscription_amount: amountRs,
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
