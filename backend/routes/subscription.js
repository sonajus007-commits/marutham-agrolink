const express  = require('express');
const crypto   = require('crypto');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { getPlan, planList, REGISTRATION_CHARGE, concessionFor, discountedAmount } = require('../utils/subscriptionPlans');
const notify   = require('../utils/notify');

const router = express.Router();
router.use(requireAuth);

// A seller pays the registration charge only on their very first activation.
// `payment_confirmed_at` is set the first time they ever pay — so its absence
// means "first time" and the ₹100 applies; renewals skip it.
function isFirstActivation(user) {
  return !user.payment_confirmed_at;
}

// ── GET /subscription/plans ───────────────────────────────────────────────────
// Returns the plan catalogue + whether the one-time registration charge applies.
router.get('/plans', (req, res) => {
  const firstTime  = isFirstActivation(req.user);
  const concession = concessionFor(req.user.gender);
  // Show the seller their EFFECTIVE (concession-applied) price per plan.
  const plans = planList().map(p => ({
    name:        p.name,
    days:        p.days,
    base_amount: p.amount,
    amount:      discountedAmount(p.amount, req.user.gender),
  }));
  res.json({
    plans,
    concession_pct:              concession,
    registration_charge:         firstTime ? REGISTRATION_CHARGE : 0,
    registration_charge_applies: firstTime,
    current_status:              req.user.status,
    current_plan:                req.user.subscription_plan || null,
    subscription_expires_at:     req.user.subscription_expires_at || null,
  });
});

// ── POST /subscription/pay ────────────────────────────────────────────────────
// Body: { plan }.  SIMULATED payment (prototype) — marks the payment successful
// immediately and activates the account. Replace the "simulated success" block
// with a real gateway (e.g. Razorpay) verification when ready.
router.post('/pay', async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only sellers have a subscription to pay for.' });
  }

  const planName = req.body.plan;
  const plan = getPlan(planName);
  if (!plan) {
    return res.status(400).json({ error: 'Please select a valid subscription plan.' });
  }

  const firstTime = isFirstActivation(req.user);
  const regCharge = firstTime ? REGISTRATION_CHARGE : 0;
  // Authoritative price: recompute the concession server-side (never trust client).
  const planFee   = discountedAmount(plan.amount, req.user.gender);
  const total     = planFee + regCharge;

  // ── SIMULATED payment success ───────────────────────────────────────────────
  // (In production, verify the gateway payment here before proceeding.)
  const paymentRef = 'PAY-' + crypto.randomBytes(4).toString('hex').toUpperCase();

  // Validity: extend from the current expiry if it is still in the future
  // (early renewal), otherwise start from today.
  const now  = new Date();
  const base = (req.user.subscription_expires_at && new Date(req.user.subscription_expires_at) > now)
    ? new Date(req.user.subscription_expires_at)
    : now;
  const expiresAt = new Date(base);
  expiresAt.setDate(expiresAt.getDate() + plan.days);

  const nowIso = now.toISOString();
  const { data: updated, error } = await supabase
    .from('users')
    .update({
      status:                  'active',
      approval_status:         'active',
      subscription_plan:        planName,
      subscription_amount:      planFee,
      ...(firstTime && { registration_charge: regCharge }),
      subscription_expires_at:  expiresAt.toISOString(),
      payment_reference:        paymentRef,
      payment_confirmed_at:     nowIso,
      block_reason:             null,
      updated_at:               nowIso,
    })
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) {
    console.error('Subscription pay error:', error);
    return res.status(500).json({ error: 'Payment could not be processed. Please try again.' });
  }

  // Record the payment + the status change (best-effort, non-blocking on failure)
  try {
    await supabase.from('subscription_payments').insert({
      user_id:             req.user.id,
      plan:                planName,
      plan_amount:         planFee,
      registration_charge: regCharge,
      total_amount:        total,
      payment_reference:   paymentRef,
      is_renewal:          !firstTime,
    });
    await supabase.from('user_status_history').insert({
      user_id:    req.user.id,
      old_status: req.user.status,
      new_status: 'active',
      reason:     `Subscription ${firstTime ? 'activated' : 'renewed'} (${planName}) — payment ${paymentRef}`,
      changed_by: req.user.id,
    });
  } catch (e) {
    console.error('Subscription payment audit error:', e.message);
  }

  notify.notifyAccountActivated(updated).catch(e => console.error('Notification error (activate):', e.message));

  const { password_hash, ...safeUser } = updated;
  res.json({
    message:                 'Payment successful. Your account is now active.',
    plan:                    planName,
    plan_amount:             planFee / 100,
    registration_charge:     regCharge / 100,
    amount_paid:             total / 100,
    payment_reference:       paymentRef,
    subscription_expires_at: updated.subscription_expires_at,
    user:                    safeUser,
  });
});

module.exports = router;
