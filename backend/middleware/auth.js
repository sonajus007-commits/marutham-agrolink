const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { resolveUserPermissions, roleKeyFor, dashboardsFor } = require('./permissions');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not logged in. Send Authorization: Bearer <token>.' });
  }

  const token = header.slice(7);
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token invalid or expired.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, login_id, phone, role, admin_role, role_id, status, block_reason, approval_status, payment_reference, payment_confirmed_at, seller_type, gender, subscription_plan, subscription_amount, subscription_expires_at, registration_charge, fname, lname, email, district, state, taluk, village_town, vco_city, district_assign, agent_vehicle, emp_id, employment_type, can_deliver, hub_id, deleted_at')
    .eq('id', payload.sub)
    .single();

  if (error || !user) return res.status(401).json({ error: 'User not found.' });

  // A removed employee is done, immediately. This is the chokepoint that gives the
  // soft delete teeth: every authenticated request re-reads the user row, so a removal
  // takes effect on the victim's very next call rather than whenever their JWT happens
  // to expire. 401, not 403 — the account is gone, so the client should log out, not
  // sit on a dead token showing an error banner.
  if (user.deleted_at) {
    return res.status(401).json({ error: 'This account has been removed. Please contact your administrator.' });
  }

  // Blocked accounts cannot access anything.
  if (user.status === 'blocked') {
    return res.status(403).json({
      error: `Your account has been blocked.${user.block_reason ? ' Reason: ' + user.block_reason + '.' : ''} Please contact Admin to unblock your account.`,
      account_status: 'blocked',
    });
  }

  // Sellers must be past the pre-approval gate. NOTE: 'suspended' status is
  // intentionally allowed through — a suspended seller can log in and reach the
  // subscription payment endpoints; the frontend restricts them to the payment
  // screen until they pay.
  if (user.role === 'farmer') {
    if (user.approval_status === 'pending_review') {
      return res.status(403).json({ error: 'Your registration is still under review.', approval_status: 'pending_review' });
    }
    if (user.approval_status === 'rejected') {
      return res.status(403).json({ error: 'Your registration was not approved. Please contact support.', approval_status: 'rejected' });
    }
  }

  // Signal to routes/frontend that a suspended seller still owes payment.
  user.needs_payment = user.role === 'farmer' && user.status === 'suspended';

  // Attach delegated trust-role flags (HR Admin / Board of Director) live from the
  // linked employee-tracker record, so approval authority is always up to date.
  user.is_hr_admin = false;
  user.is_board_director = false;
  if (user.role === 'admin' && user.emp_id) {
    const { data: emp, error } = await supabase
      .from('employees')
      .select('is_hr_admin, is_board_director, approval_status')
      .eq('emp_id', user.emp_id)
      .maybeSingle();

    // Refuse rather than silently de-privilege. Swallowing this error left both
    // flags false, so an HR Admin or Board Director quietly lost their approval
    // authority — the button simply stopped working, with nothing logged and no
    // way to trace it. If we cannot establish authority, we say so.
    if (error) {
      console.error(`Trust-flag lookup failed for emp_id ${user.emp_id}:`, error.message);
      return res.status(500).json({ error: 'Could not verify your approval authority. Please try again.' });
    }
    if (emp && emp.approval_status === 'approved') {
      user.is_hr_admin = emp.is_hr_admin === true;
      user.is_board_director = emp.is_board_director === true;
    }
  }

  // Resolve the RBAC permission map (role UNION trust-flag roles) onto the user so
  // every downstream route — and requirePermission — can gate without another read.
  // Refuse rather than proceed permission-less: an unresolved map would either lock
  // a legitimate user out of everything or, if a guard reads it wrong, let them in.
  try {
    user.permissions = await resolveUserPermissions(user);
    user.role_key = await roleKeyFor(user.role_id);
    user.dashboards = dashboardsFor(user, user.permissions, user.role_key);
  } catch (e) {
    console.error(`Permission resolution failed for ${user.login_id}:`, e.message);
    return res.status(500).json({ error: 'Could not establish your permissions. Please try again.' });
  }

  req.user = user;
  next();
}

/**
 * Identify the caller if they present a valid token; never reject.
 *
 * For endpoints that are PUBLIC but show a signed-in user more than they show a
 * stranger — the product page being the first: an anonymous visitor (and any
 * search-engine crawler) sees a grower's district, a signed-in customer sees who
 * they are buying from. Anything invalid or missing simply means "anonymous", so
 * a bad token can never turn a public page into a 401.
 */
async function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();

  try {
    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    // reads-ok: this route must NEVER reject — any failure, including a deleted user
    // (which .single() reports as an error), degrades to anonymous by design
    const { data: user } = await supabase
      .from('users')
      .select('id, login_id, role, admin_role, status, fname, lname, district, deleted_at')
      .eq('id', payload.sub)
      .single();
    // A blocked or removed account is treated as anonymous here rather than 403'd:
    // this is a public page, and it must not become an account-status oracle.
    if (user && user.status !== 'blocked' && !user.deleted_at) req.user = user;
  } catch {
    /* expired / forged / unknown → anonymous */
  }
  next();
}

// Middleware factory — requireRole('admin') or requireRole('farmer', 'admin')
function requireRole(...roles) {
  return [
    requireAuth,
    (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}.` });
      }
      next();
    }
  ];
}

module.exports = { requireAuth, optionalAuth, requireRole };
