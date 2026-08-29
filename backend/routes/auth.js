const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { permissionPayload, roleIdForAdminRole } = require('../middleware/permissions');
const {
  loginLimiter,
  otpLimiter,
  resetLimiter,
  registerLimiter,
} = require('../middleware/rateLimit');
const { distCode, stateCode } = require('../utils/codeGen');
const { geocodeAddress, geocodingEnabled } = require('../utils/geocode');
const notify = require('../utils/notify');

const router = express.Router();

// ── Login ID generation ───────────────────────────────────────────────────────
//
// District-level roles  → [rolePrefix][stateCode][distCode]_[name3][counter]
//   e.g. CNTNPDK_KAVA01  (Consumer, Tamil Nadu, Pudukkottai, Kavitha, 1st)
//
// State-level roles     → [rolePrefix][stateCode]_[name3][counter]
//   e.g. RMTN_DEEA01     (Regional Manager, Tamil Nadu, Deepa, 1st)
//
// rolePrefix (2 chars):
const ROLE_PREFIXES = {
  consumer:           'CN',
  farmer:             'FR',
  'Retailer':         'RT',
  'Delivery Agent':   'DA',
  'VCO':              'VC',
  'District Manager': 'DM',
  'Hub Incharge':     'HI',
  'Regional Manager': 'RM',
  'State Head':       'SH',
  'Head Office':      'HO',
  // Management / org-level designations (shown in Add Staff, mirror Add Employee).
  'Board of Director': 'BD',
  'CEO':               'CO',
  'Managing Director': 'MD',
  'CFO':               'CF',
  'CTO':               'CT',
  'Technical Admin':   'TA',
  'HR Admin':          'HA',
  'HR Manager':        'HM',
  'Zonal Manager':     'ZM',
};

// State-level roles have no district segment in their login ID. Top management /
// org-level roles are company-wide, so they too skip the district segment.
const STATE_LEVEL_ROLES = new Set(['Regional Manager', 'State Head', 'Head Office',
  'Board of Director', 'CEO', 'Managing Director', 'CFO', 'CTO', 'Technical Admin',
  'HR Admin', 'HR Manager', 'Zonal Manager']);

// Employee-master designation → staff login role (admin_role) used for access
// control. Single source of truth lives in utils/designationRole (shared with the
// employee edit flow, which keeps a linked login's role in sync). A management/org
// title with no distinct login role is not a key there; the create flow below falls
// back to the raw designation for it.
const { DESIGNATION_TO_ROLE } = require('../utils/designationRole');

// Counter format: [A-Z][01-99] — always visually alphanumeric.
// Sequence: A01, A02 … A99, B01 … Z99  (2,574 slots per name prefix).
function toAlphaCounter(n) {
  const letter = String.fromCharCode(64 + Math.ceil(n / 99)); // A=1..Z=26
  const num    = ((n - 1) % 99) + 1;
  return letter + String(num).padStart(2, '0');
}

function fromAlphaCounter(s) {
  if (!/^[A-Z]\d{2}$/.test(s)) return 0;
  return (s.charCodeAt(0) - 64 - 1) * 99 + parseInt(s.slice(1));
}

// Generate a unique login ID by querying the DB for the highest existing counter
// on the same base prefix, then issuing the next one.
async function generateLoginId(role, adminRole, state, district, fname, sellerType) {
  let rp;
  if (role === 'admin')         rp = ROLE_PREFIXES[adminRole];
  else if (role === 'farmer')   rp = sellerType === 'Retailer' ? ROLE_PREFIXES['Retailer'] : ROLE_PREFIXES['farmer'];
  else                          rp = ROLE_PREFIXES[role];
  rp = rp || 'US';
  const sc     = stateCode(state);
  const dc     = distCode(district);
  const name3  = (fname || 'USR').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const isStateLevel = role === 'admin' && STATE_LEVEL_ROLES.has(adminRole);

  // State-level: RMTN_DEE  |  District-level: CNTNPDK_KAV
  const base = isStateLevel
    ? `${rp}${sc}_${name3}`
    : `${rp}${sc}${dc}_${name3}`;

  const { data, error } = await supabase
    .from('users')
    .select('login_id')
    .like('login_id', `${base}%`);

  if (error) throw new Error(`Login ID lookup failed: ${error.message}`);

  let maxN = 0;
  (data || []).forEach(row => {
    const tail = row.login_id.slice(base.length); // e.g. "A01"
    const n    = fromAlphaCounter(tail);
    if (n > maxN) maxN = n;
  });

  return `${base}${toAlphaCounter(maxN + 1)}`;
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Today's date in IST as 'YYYY-MM-DD'. The business runs in one timezone (see
// packages/lib IST_OFFSET_MINUTES); a delivery agent's "ready today" must roll
// over at IST midnight, not the server's UTC midnight.
function istDateToday() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

// A login identifier is a phone or a login_id: letters, digits, underscore, and the
// +/- and space a phone may carry. Nothing here is a PostgREST filter separator, so a
// value that passes cannot break out of the .or() filter it is interpolated into.
// Capped at 64 chars — no real identifier is longer, and it bounds the log line.
function isValidIdentifier(v) {
  return typeof v === 'string' && /^[A-Za-z0-9_+\- ]{1,64}$/.test(v);
}

// Record a login attempt (success or failure) for audit/quality tracing.
// Best-effort — never blocks or fails the login flow.
async function logLogin(req, { user_id = null, login_id = null, method, outcome }) {
  try {
    const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip  = xff || (req.socket && req.socket.remoteAddress) || null;
    // reads-ok: best-effort audit row; a failed log must never fail the login it records
    await supabase.from('user_login_history').insert({
      user_id, login_id, method,
      success: outcome === 'success',
      outcome,
      ip_address: ip,
      user_agent: req.headers['user-agent'] || null,
    });
  } catch (e) {
    console.error('Login history log error:', e.message);
  }
}

function safeUser(u) {
  // Strip password_hash before returning to client
  const { password_hash, ...rest } = u;
  return rest;
}

// safeUser + the resolved RBAC role_key and permission map, so the client always
// receives the same shape whether it just logged in (no requireAuth) or called
// /me. Consumers/farmers get role_key null and permissions {}.
async function withPerms(u) {
  return { ...safeUser(u), ...(await permissionPayload(u)) };
}

// If a seller's subscription has lapsed, drop them to 'suspended' so they can
// still log in and renew (renewals pay the plan fee only — no ₹100). Mutates
// `user` in place and records the change. Returns true if it suspended them.
// Password lifecycle policy (migration 049). One knob each, in days.
const PASSWORD_MAX_AGE_DAYS = 90; // a password older than this is expired → must reset
const INACTIVITY_MAX_DAYS   = 90; // no successful login for this long → login locked
const LIFECYCLE_MS_PER_DAY  = 24 * 60 * 60 * 1000;

// True when `ts` (an ISO timestamp or null) is older than `days` days. A null/absent
// timestamp is treated as NOT stale: a brand-new account (no login yet) or a row that
// predates the column must never be locked or expired by the mere absence of data.
function olderThanDays(ts, days) {
  if (!ts) return false;
  return Date.now() - new Date(ts).getTime() > days * LIFECYCLE_MS_PER_DAY;
}

// Lazy inactivity lock, checked at login (mirrors maybeSuspendOnExpiry). If the last
// successful login is more than INACTIVITY_MAX_DAYS ago, stamp a DEDICATED login lock —
// deliberately separate from the seller `status` machine, so a lapsed-subscription
// suspension and an inactivity lock never shadow one another. The only way back in is a
// password reset, which clears the lock. Best-effort by the same rule as
// maybeSuspendOnExpiry: a failed write must not claim a lock it did not take.
async function maybeLockOnInactivity(user) {
  if (user.login_locked_at) return true;                                   // already locked
  if (!olderThanDays(user.last_login_at, INACTIVITY_MAX_DAYS)) return false;
  const now = new Date().toISOString();
  const reason = `No login for ${INACTIVITY_MAX_DAYS}+ days`;
  const { error } = await supabase.from('users')
    .update({ login_locked_at: now, login_lock_reason: reason, updated_at: now })
    .eq('id', user.id);
  if (error) {
    console.error(`Failed to lock inactive account ${user.id}:`, error.message);
    return false;
  }
  user.login_locked_at = now;
  user.login_lock_reason = reason;
  return true;
}

// Stamp a successful login so the inactivity clock restarts. Best-effort: a failed
// write must never fail the login it is only recording.
async function stampLoginSuccess(userId) {
  const { error } = await supabase.from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
  if (error) console.error(`Failed to stamp last_login_at for ${userId}:`, error.message);
}

async function maybeSuspendOnExpiry(user) {
  if (user.role === 'farmer' && user.status === 'active' && user.subscription_expires_at
      && new Date(user.subscription_expires_at) < new Date()) {
    const { error } = await supabase.from('users')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', user.id);

    // The suspension has to LAND. Discarding this error meant a failed write still
    // set user.status below and returned true — the request believed it had
    // suspended a lapsed seller while the row still said 'active', so the
    // suspension silently never happened and the expired subscription kept full
    // access on the next request. Say we did nothing, because we did nothing.
    if (error) {
      console.error(`Failed to suspend lapsed seller ${user.id}:`, error.message);
      return false;
    }

    // reads-ok: best-effort history row; it must not fail a login that already suspended
    await supabase.from('user_status_history').insert({
      user_id: user.id, old_status: 'active', new_status: 'suspended',
      reason: 'Subscription expired', changed_by: null,
    }).then(() => {}, () => {});
    user.status = 'suspended';
    return true;
  }
  return false;
}

// Decide whether a user may log in. Returns either
//   { ok: true, needsPayment }  — issue a token
//   { ok: false, code, body }   — reject with this status/body
// Applies to BOTH password and OTP login so the rules stay in one place.
function evaluateAccess(user) {
  // A removed employee cannot sign in, by any method. Checked first and reported as
  // plain bad credentials: "that account was removed" tells an outsider that the
  // number belongs to a real ex-employee, and the person it actually concerns has
  // already been told by HR. Both login paths (password and OTP) come through here,
  // which is the entire reason this function exists.
  if (user.deleted_at) {
    return { ok: false, code: 401, body: { error: 'Invalid phone number or password.' } };
  }
  if (user.role === 'farmer') {
    if (user.approval_status === 'pending_review') {
      return { ok: false, code: 403, body: { error: 'Your registration is under review by our team. You will be notified once approved.', approval_status: 'pending_review' } };
    }
    if (user.approval_status === 'rejected') {
      return { ok: false, code: 403, body: { error: `Your registration was not approved. ${user.rejection_reason ? 'Reason: ' + user.rejection_reason : 'Please contact support.'}`, approval_status: 'rejected' } };
    }
  }
  if (user.status === 'blocked') {
    return { ok: false, code: 403, body: {
      error: `Your account has been blocked.${user.block_reason ? ' Reason: ' + user.block_reason + '.' : ''} Please contact Admin to unblock your account.`,
      account_status: 'blocked',
    } };
  }
  // Password lifecycle (migration 049). These gate EVERY login method, OTP included —
  // OTP is the way you RESET the password, not a way to skip the policy. The path back
  // in is always the same: Forgot password → OTP → new password, which clears the lock
  // and restarts both clocks. `password_action` tells the client which message to show
  // and to drop the user straight into the reset flow.
  if (user.login_locked_at) {
    return { ok: false, code: 403, body: {
      error: `Your account was locked after ${INACTIVITY_MAX_DAYS} days without a login. Reset your password to sign in again.`,
      password_action: 'locked',
    } };
  }
  if (user.must_change_password) {
    return { ok: false, code: 403, body: {
      error: 'Set your own password before signing in. Use “Forgot password” to choose a new one.',
      password_action: 'must_reset',
    } };
  }
  if (olderThanDays(user.password_changed_at, PASSWORD_MAX_AGE_DAYS)) {
    return { ok: false, code: 403, body: {
      error: `Your password has expired (${PASSWORD_MAX_AGE_DAYS}-day policy). Reset it to continue.`,
      password_action: 'expired',
    } };
  }
  // 'suspended' sellers may log in, but must pay before the home page unlocks.
  return { ok: true, needsPayment: user.role === 'farmer' && user.status === 'suspended' };
}

// Why a rejected login attempt was rejected, for the login history. Both login paths
// derived this inline and identically; a removed employee would have been recorded
// under their approval_status — i.e. logged as 'approved' while being turned away.
// The one place where "who tried to get in after we removed them" is answerable is
// the last place that should be guessing.
function loginOutcome(user) {
  if (user.deleted_at) return 'removed';
  if (user.status === 'blocked') return 'blocked';
  if (user.login_locked_at) return 'inactive_locked';
  if (user.must_change_password) return 'must_change_password';
  if (olderThanDays(user.password_changed_at, PASSWORD_MAX_AGE_DAYS)) return 'password_expired';
  return user.approval_status || 'rejected';
}

// ── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', registerLimiter, async (req, res) => {
  const {
    phone, password, role,
    fname, lname, email, alt_phone,
    gender,
    country_code,
    house_no, street1, street2, landmark,
    village_town, city, taluk, district, pincode, state, country,
    // farmer (Farmer type)
    aadhar, bank_name, bank_account, ifsc,
    // farmer (Retailer type)
    seller_type, business_name, gst_number, business_type,
    // subscription plan chosen at registration
    subscription_plan,
  } = req.body;

  if (!phone || !password || !role || !fname) {
    return res.status(400).json({ error: 'phone, password, role, and fname are required.' });
  }
  if (!['consumer', 'farmer'].includes(role)) {
    return res.status(400).json({ error: 'role must be consumer or farmer.' });
  }
  if (role === 'farmer' && !['Farmer', 'Retailer'].includes(seller_type)) {
    return res.status(400).json({ error: 'seller_type must be Farmer or Retailer.' });
  }
  if (role === 'farmer' && seller_type === 'Retailer' && !business_name) {
    return res.status(400).json({ error: 'business_name is required for Retailers.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  // Pincode is mandatory — it drives delivery tracking.
  if (!/^\d{6}$/.test(String(pincode || ''))) {
    return res.status(400).json({ error: 'A valid 6-digit pincode is required.' });
  }

  // A guard whose query fails must FAIL, not wave the request through. Swallowing
  // this error meant a transient fault let a second account onto a phone number
  // that already had one — and login matches on `phone`, so `.maybeSingle()` then
  // threw PGRST116 for BOTH accounts and answered "invalid password" forever.
  const { data: existing, error: existingErr } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existingErr) {
    return res.status(500).json({ error: 'Could not verify whether this phone number is already registered. Please try again.' });
  }
  if (existing) {
    return res.status(409).json({ error: 'An account with this phone number already exists.' });
  }

  const password_hash = await bcrypt.hash(password, 12);

  // generateLoginId THROWS when its lookup fails, and Express 4 does not catch an
  // async throw — the promise rejects, no response is ever sent, and Node's default
  // unhandled-rejection behaviour takes the whole API process down with it. One
  // failed read during one signup, and every other user's request dies too.
  // orders.js has always guarded its equivalent (generateOrderCode); this did not.
  let login_id;
  try {
    login_id = await generateLoginId(role, req.body.admin_role, state, district, fname, seller_type);
  } catch (err) {
    console.error('generateLoginId error:', err.message);
    return res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }

  // Farmers and retailers go into pending review; consumers are immediately active
  const approval_status = role === 'farmer' ? 'pending_review' : 'active';

  const newUser = {
    login_id, phone, password_hash, role,
    // Self-registered: they chose this password, so it starts a fresh 90-day clock and
    // they are NOT forced to change it (must_change_password stays false by default).
    password_changed_at: new Date().toISOString(),
    fname, lname, email, alt_phone,
    gender: gender || null,
    country_code: country_code || '+91',
    house_no, street1, street2, landmark,
    village_town, city, taluk, district, pincode,
    state, country: country || 'India',
    approval_status,
    ...(role === 'farmer' && { seller_type }),
    ...(role === 'farmer' && seller_type === 'Farmer'   && { aadhar, bank_name, bank_account, ifsc }),
    ...(role === 'farmer' && seller_type === 'Retailer' && { business_name, gst_number, business_type }),
    ...(role === 'farmer' && subscription_plan && { subscription_plan }),
  };

  const { data: created, error } = await supabase
    .from('users')
    .insert(newUser)
    .select()
    .single();

  if (error) {
    console.error('Register error:', error);
    return res.status(500).json({ error: 'Could not create account. Please try again.' });
  }

  // Send confirmation notifications to applicant + admin (non-blocking)
  if (role === 'farmer') {
    notify.notifyRegistrationReceived(created).catch(e =>
      console.error('Registration notification error:', e.message)
    );
  }

  const message = role === 'farmer'
    ? 'Registration submitted successfully. Your application is under review. You will be notified once approved.'
    : 'Account created successfully.';

  res.status(201).json({
    message,
    login_id: created.login_id,
    user: await withPerms(created),
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone/Login ID and password are required.' });
  }

  // The identifier goes straight into a PostgREST .or() filter STRING below, so it must
  // not be allowed to carry filter syntax. A real identifier is a phone (digits) or a
  // login_id (letters/digits/underscore, e.g. HO001, SHTN_SENA01) — never a comma, dot,
  // parenthesis or space, which are exactly PostgREST's filter separators. Allowlisting
  // the legitimate charset closes the injection without changing the query shape. Reject
  // rather than sanitise: a login id with a comma in it was never going to authenticate.
  if (!isValidIdentifier(phone)) {
    await logLogin(req, { login_id: String(phone).slice(0, 64), method: 'password', outcome: 'invalid_credentials' });
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }

  // Accept phone number, login_id, OR Employee ID (emp_id) in the identifier field.
  // Staff now sign in with their Employee ID (which is also their login_id for new
  // accounts); the emp_id term also lets any existing staffer whose stored login_id
  // still differs sign in with their Employee ID. The identifier was allowlisted
  // above, so it carries no PostgREST filter syntax.
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .or(`phone.eq.${phone},login_id.eq.${phone},emp_id.eq.${phone}`)
    .maybeSingle();

  if (error || !user) {
    await logLogin(req, { login_id: phone, method: 'password', outcome: 'invalid_credentials' });
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }

  // Verify credentials before revealing any account-state details.
  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'password', outcome: 'invalid_credentials' });
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }

  // Lapsed subscription → suspend (they can still log in to renew). Long inactivity →
  // lock (they cannot log in until they reset). Both run before the access gate reads
  // the resulting state.
  await maybeSuspendOnExpiry(user);
  await maybeLockOnInactivity(user);

  const access = evaluateAccess(user);
  if (!access.ok) {
    const outcome = loginOutcome(user);
    await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'password', outcome });
    return res.status(access.code).json(access.body);
  }

  await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'password', outcome: 'success' });
  await stampLoginSuccess(user.id);

  const token = signToken(user.id);
  res.json({
    message: 'Login successful.',
    token,
    user: await withPerms(user),
    needs_payment: access.needsPayment,
  });
});

// ── POST /auth/send-otp ───────────────────────────────────────────────────────
// Sandbox: OTP is logged to console and returned in response (not in production).
const otpStore = new Map(); // phone → { otp, expiresAt }

router.post('/send-otp', otpLimiter, async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required.' });

  const { data: user, error: lookupErr } = await supabase
    .from('users')
    .select('id, status, deleted_at')
    .eq('phone', phone)
    .maybeSingle();

  // Distinct from "no account": a failed lookup must not be reported as one, or a
  // blocked account could be handed an OTP the moment the query blips.
  if (lookupErr) return res.status(500).json({ error: 'Could not look up that phone number. Please try again.' });
  if (!user) return res.status(404).json({ error: 'No account found with this phone number.' });
  // A removed employee looks exactly like no account at all. This path does not go
  // through evaluateAccess, so without this line a removed employee could still pull
  // an OTP out of the system — and reset-password below trusts nothing but that OTP.
  if (user.deleted_at) return res.status(404).json({ error: 'No account found with this phone number.' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'Account is blocked.' });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  otpStore.set(phone, { otp, expiresAt: Date.now() + 10 * 60 * 1000 }); // 10-minute expiry

  console.log(`[SANDBOX OTP] phone=${phone} otp=${otp}`);

  // In production: replace the log above with an SMS provider call (e.g. Twilio, MSG91).
  res.json({
    message: 'OTP sent.',
    ...(process.env.NODE_ENV !== 'production' && { otp }), // expose OTP in sandbox only
  });
});

// ── POST /auth/verify-otp ─────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: 'phone and otp are required.' });

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ error: 'No OTP was sent to this number. Call /auth/send-otp first.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
  }
  if (record.otp !== otp) {
    await logLogin(req, { login_id: phone, method: 'otp', outcome: 'otp_invalid' });
    return res.status(400).json({ error: 'Incorrect OTP.' });
  }

  otpStore.delete(phone);

  // maybeSingle, not single: `.single()` raises PGRST116 when it matches no rows,
  // so "account not found" and "the database is broken" arrive as the same error.
  // maybeSingle gives null for the first and reserves `error` for the second.
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (userErr) return res.status(500).json({ error: 'Could not complete sign-in. Please try again.' });

  if (!user) {
    await logLogin(req, { login_id: phone, method: 'otp', outcome: 'invalid_credentials' });
    return res.status(401).json({ error: 'Account not found.' });
  }

  // Lapsed subscription → suspend; long inactivity → lock. Then the same access gate
  // as password login (OTP does not bypass the password lifecycle — it is how you
  // reset, via /reset-password, not a way around expiry or the lock).
  await maybeSuspendOnExpiry(user);
  await maybeLockOnInactivity(user);
  const access = evaluateAccess(user);
  if (!access.ok) {
    const outcome = loginOutcome(user);
    await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'otp', outcome });
    return res.status(access.code).json(access.body);
  }

  await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'otp', outcome: 'success' });
  await stampLoginSuccess(user.id);

  const token = signToken(user.id);
  res.json({
    message: 'OTP verified. Login successful.',
    token,
    user: await withPerms(user),
    needs_payment: access.needsPayment,
  });
});

// ── POST /auth/change-password ───────────────────────────────────────────────
// Requires auth. Body: { current_password, new_password }
router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const { data: fullUser, error: fullUserErr } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', req.user.id)
    .maybeSingle();

  // Unguarded, a failed read reached `fullUser.password_hash` and crashed the
  // route on a TypeError — a 500 with a stack trace instead of an answer.
  if (fullUserErr || !fullUser) {
    return res.status(500).json({ error: 'Could not verify your current password. Please try again.' });
  }

  const ok = await bcrypt.compare(current_password, fullUser.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  const nowIso = new Date().toISOString();
  const password_hash = await bcrypt.hash(new_password, 12);
  const { error } = await supabase
    .from('users')
    // A logged-in password change also restarts the 90-day clock and clears any
    // initial-password requirement (they have just chosen their own).
    .update({ password_hash, password_changed_at: nowIso, must_change_password: false, updated_at: nowIso })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ error: 'Could not update password.' });
  res.json({ message: 'Password changed successfully.' });
});

// ── POST /auth/reset-password ────────────────────────────────────────────────
// Body: { phone, otp, new_password }
// Uses the same OTP previously sent via /send-otp
router.post('/reset-password', resetLimiter, async (req, res) => {
  const { phone, otp, new_password } = req.body;
  if (!phone || !otp || !new_password) {
    return res.status(400).json({ error: 'phone, otp, and new_password are required.' });
  }
  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ error: 'No OTP was sent to this number. Request one first.' });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: 'OTP has expired. Request a new one.' });
  }
  if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect OTP.' });

  otpStore.delete(phone);

  const password_hash = await bcrypt.hash(new_password, 12);
  // The deleted_at filter belongs on the WRITE, not on a lookup above it. An OTP issued
  // in the ten minutes before the removal is still valid after it, and this route trusts
  // nothing but the OTP — so the only reliable place to refuse a removed account is the
  // statement that would otherwise set their new password.
  const nowIso = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('users')
    .update({
      password_hash,
      // A reset is the one action that satisfies the whole lifecycle: it sets a fresh
      // password (restarting the 90-day clock), clears the initial-password flag, and
      // lifts an inactivity lock. It does NOT touch `status`, so a seller suspended for
      // an unpaid subscription stays suspended — this only clears the login lock.
      password_changed_at: nowIso,
      must_change_password: false,
      login_locked_at: null,
      login_lock_reason: null,
      updated_at: nowIso,
    })
    .eq('phone', phone)
    .is('deleted_at', null)
    .select('id');

  if (error) return res.status(500).json({ error: 'Could not reset password.' });
  // Matched nothing: the account is gone. Same wording as a wrong number — a password
  // reset form should not confirm who used to work here.
  if (!updated || updated.length === 0) {
    return res.status(404).json({ error: 'No account found with this phone number.' });
  }

  res.json({ message: 'Password reset successfully. You can now login.' });
});

// ── POST /auth/create-staff ───────────────────────────────────────────────────
// Admin creates a VCO / Delivery Agent / District Manager / Hub Incharge / RM / SH account
const MGMT_ROLES = ['Board of Director','CEO','Managing Director','CFO','CTO',
  'Technical Admin','HR Admin','HR Manager','Zonal Manager'];
const CREATABLE_BY = {
  'Head Office':      ['VCO','Delivery Agent','District Manager','Hub Incharge','Regional Manager','State Head','Head Office', ...MGMT_ROLES],
  'State Head':       ['VCO','Delivery Agent','District Manager','Hub Incharge','Regional Manager'],
  'Regional Manager': ['VCO','Delivery Agent','District Manager','Hub Incharge'],
  'District Manager': ['VCO','Delivery Agent'],
};

router.post('/create-staff', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { fname, lname, phone, password, district, state, gender, village_town,
          taluk, city, pincode, aadhar, agent_vehicle, emp_id } = req.body;
  if (!fname || !phone || !password) {
    return res.status(400).json({ error: 'fname, phone, and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Every staff login represents an approved employee: the Employee ID is mandatory,
  // and the login role + company details are read authoritatively from the master.
  const empId = (emp_id || '').trim();
  if (!empId) {
    return res.status(400).json({ error: 'Employee ID is required. Add & approve the employee in the tracker first, then create their login.' });
  }
  const { data: emp, error: empErr } = await supabase
    .from('employees')
    .select('emp_id, designation, employment_type, status, approval_status')
    .eq('emp_id', empId)
    .is('deleted_at', null)          // a removed employee cannot be given a fresh login
    .maybeSingle();
  if (empErr)  return res.status(500).json({ error: 'Could not verify Employee ID against the employee tracker.' });
  if (!emp)    return res.status(404).json({ error: `Employee ID "${empId}" is not in the employee tracker.` });
  if (emp.approval_status !== 'approved') return res.status(400).json({ error: `Employee "${empId}" is not yet HR-approved. A login can only be created after approval.` });
  if (emp.status !== 'active')            return res.status(400).json({ error: `Employee ID "${empId}" is marked ${emp.status} in the employee tracker.` });
  if (!emp.designation)                   return res.status(400).json({ error: `Employee "${empId}" has no designation set. Set the designation on the employee record first.` });

  // Login role is derived from the employee's designation (never trusted from the client).
  const admin_role = DESIGNATION_TO_ROLE[emp.designation] || emp.designation;

  // Mandatory profile fields for every staff member.
  // Taluk is validated conditionally on the client (some districts have none),
  // so it is not part of this unconditional server check.
  const missing = [];
  if (!gender)  missing.push('gender');
  if (!state)   missing.push('state');
  if (!district) missing.push('district');
  if (!pincode) missing.push('pincode');
  if (!aadhar)  missing.push('Aadhaar number');
  if (missing.length) {
    return res.status(400).json({ error: 'Required: ' + missing.join(', ') + '.' });
  }
  // Village/Town decides which orders a VCO / Delivery Agent handles — required for those roles.
  if ((admin_role === 'VCO' || admin_role === 'Delivery Agent') && !village_town) {
    return res.status(400).json({ error: 'village_town is required for VCO and Delivery Agent.' });
  }

  const allowed = CREATABLE_BY[req.user.admin_role] || [];
  if (!allowed.includes(admin_role)) {
    return res.status(403).json({ error: `Your role (${req.user.admin_role}) cannot create ${admin_role} accounts.` });
  }

  // One login per employee: an Employee ID may back only a single staff account.
  // (Uses limit(1) rather than maybeSingle so a pre-existing duplicate can't throw.)
  const { data: dupEmp, error: dupEmpErr } = await supabase
    .from('users')
    .select('login_id')
    .eq('emp_id', empId)
    .limit(1);
  if (dupEmpErr) {
    return res.status(500).json({ error: 'Could not verify whether this Employee ID already has a login. Please try again.' });
  }
  if (dupEmp && dupEmp.length) {
    return res.status(409).json({ error: `Employee "${empId}" already has a login (${dupEmp[0].login_id}). One employee can hold only one login account.` });
  }

  const { data: existing, error: existingErr } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (existingErr) {
    return res.status(500).json({ error: 'Could not verify whether this phone number is already registered. Please try again.' });
  }
  if (existing) return res.status(409).json({ error: 'A user with this phone number already exists.' });

  const password_hash = await bcrypt.hash(password, 12);

  // The Employee ID IS the staff login id — a staffer signs in with their phone or
  // their Employee ID, not a separate generated code. It is unique per employee (one
  // login per employee is enforced above), so it satisfies the login_id unique
  // constraint; a collision with some other account's login_id would surface as the
  // insert error below. generateLoginId now serves only consumer/farmer registration.
  const login_id = emp.emp_id;

  // Attach the canonical RBAC role so the new staffer has permissions on their
  // very first login — without waiting for a re-seed/backfill. A null here (an
  // admin_role that maps to no canonical role) is left for the backfill to report.
  const role_id = await roleIdForAdminRole(admin_role);

  const newUser = {
    login_id, phone, password_hash,
    role: 'admin', admin_role,
    ...(role_id ? { role_id } : {}),
    // Admin-created staff logins ship with a temporary password: force the new staffer
    // to set their own before they can sign in (policy decision B). The 90-day clock
    // still starts now, so a login they never activate also expires on schedule.
    must_change_password: true,
    password_changed_at: new Date().toISOString(),
    fname, lname: lname || '',
    gender: gender || null,
    district: district || req.user.district,
    state: state || req.user.state,
    country: 'India',
    country_code: '+91',
    ...(taluk ? { taluk } : {}),
    ...(city ? { city } : {}),
    ...(pincode ? { pincode } : {}),
    ...(aadhar ? { aadhar } : {}),
    ...(agent_vehicle ? { agent_vehicle } : {}),
    emp_id: emp.emp_id,
    ...(emp.employment_type ? { employment_type: emp.employment_type } : {}),
    // Keep both fields in sync: village_town is the canonical address field (editable
    // everywhere); vco_city is what the VCO order query historically reads.
    ...(village_town ? { village_town, vco_city: village_town } : {}),
  };

  const { data: created, error } = await supabase
    .from('users')
    .insert(newUser)
    .select()
    .single();

  if (error) {
    console.error('create-staff error:', error);
    return res.status(500).json({ error: 'Could not create staff account.' });
  }

  res.status(201).json({
    message: 'Staff account created.',
    login_id: created.login_id,
    user: await withPerms(created),
  });
});

// ── GET /me ───────────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', req.user.id)
    .single();

  if (error) return res.status(500).json({ error: 'Could not fetch profile.' });

  res.json({ user: await withPerms(user) });
});

// ── PATCH /me ─────────────────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  // Fields a user can update on their own profile
  const ALLOWED = [
    'fname', 'lname', 'email', 'alt_phone',
    'gender',
    'house_no', 'street1', 'street2', 'landmark',
    'village_town', 'city', 'taluk', 'district', 'pincode', 'state', 'country',
    'agent_vehicle',                                   // agent vehicle
    'service_villages',                                // Delivery Agent: villages they cover (text[])
    'service_areas',                                   // Delivery Agent: coverage grouped by taluk (JSONB)
    'hub_id',                                          // Delivery Agent: the taluk hub responsible for them
    'delivery_addresses',                              // consumer address book (JSONB array)
    'farm_lat', 'farm_lng',                            // seller farm coordinates (best-effort GPS)
    'agent_lat', 'agent_lng',                          // Delivery Agent live coordinates (set with "ready")
    'shop_open_hour', 'shop_close_hour',               // Retailer: daily trading window (IST hours)
  ];

  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  // Coordinates are the one whitelisted pair the DB stores as a number, so a bad
  // value here would be a 500 from Postgres, not a clean 400. Validate + coerce.
  // null is allowed (clearing the location); a present value must be in range.
  for (const [key, min, max] of [
    ['farm_lat', -90, 90], ['farm_lng', -180, 180],
    ['agent_lat', -90, 90], ['agent_lng', -180, 180],
  ]) {
    if (updates[key] === undefined || updates[key] === null) continue;
    const n = Number(updates[key]);
    if (!Number.isFinite(n) || n < min || n > max) {
      return res.status(400).json({ error: 'Invalid location.' });
    }
    updates[key] = n;
  }

  // Freshness stamp for the live-tracking map. Whenever the agent's coordinates move
  // — the daily "Ready" snapshot or a periodic ping while out delivering — record
  // WHEN, so a consumer's map can tell a live dot from a stale one and stop showing
  // a position that hasn't refreshed. Clearing the location (null) clears the stamp.
  if (updates.agent_lat !== undefined || updates.agent_lng !== undefined) {
    const cleared = updates.agent_lat === null || updates.agent_lng === null;
    updates.agent_loc_at = cleared ? null : new Date().toISOString();
  }

  // Delivery Agent coverage — [{ taluk, villages: [] }]. Validate the shape (a bad
  // jsonb would be stored verbatim and break the reader), normalise, and bound it.
  if (updates.service_areas !== undefined) {
    const raw = updates.service_areas;
    if (!Array.isArray(raw) || raw.length > 50) {
      return res.status(400).json({ error: 'Coverage must be a list of up to 50 taluks.' });
    }
    const areas = [];
    for (const a of raw) {
      const taluk = a && typeof a.taluk === 'string' ? a.taluk.trim() : '';
      if (!taluk) return res.status(400).json({ error: 'Each covered area needs a taluk.' });
      const villages = Array.isArray(a.villages)
        ? [...new Set(a.villages.map((v) => String(v).trim()).filter(Boolean))].slice(0, 200)
        : [];
      areas.push({ taluk, villages });
    }
    updates.service_areas = areas;
  }

  // Delivery Agent hub — must be a real hub (an invalid id would be a Postgres FK
  // 500, not a clean 400). null clears it.
  if (updates.hub_id !== undefined && updates.hub_id !== null) {
    const { data: hub, error: hubErr } = await supabase
      .from('hubs').select('id').eq('id', updates.hub_id).maybeSingle();
    if (hubErr) {
      console.error('hub_id lookup failed:', hubErr.message);
      return res.status(500).json({ error: 'Could not verify the selected hub.' });
    }
    if (!hub) return res.status(400).json({ error: 'That hub does not exist.' });
  }

  // Daily "ready for delivery" flag. `available` is a VIRTUAL boolean, never a
  // column: the server owns the date so it can lapse overnight. true stamps
  // today's IST date (ready-today ⇔ available_date === today); false clears it.
  if (req.body.available !== undefined) {
    updates.available_date = req.body.available ? istDateToday() : null;
  }

  // Retailer trading window. There is a CHECK constraint behind this (migration
  // 035), so an unvalidated bad pair would surface as a Postgres 500 rather than a
  // usable message. Both hours move together: a request that sets only one would
  // be checked against a stale partner, so the pair is read from the merge of what
  // was sent and what is stored.
  if (updates.shop_open_hour !== undefined || updates.shop_close_hour !== undefined) {
    const { data: current, error: cErr } = await supabase
      .from('users')
      .select('shop_open_hour, shop_close_hour')
      .eq('id', req.user.id)
      .maybeSingle();
    if (cErr) {
      console.error('Shop-hours lookup failed:', cErr.message);
      return res.status(500).json({ error: 'Could not read your current shop hours.' });
    }

    const pick = (k) => (updates[k] !== undefined ? updates[k] : current?.[k] ?? null);
    const open = pick('shop_open_hour');
    const close = pick('shop_close_hour');

    // Clearing BOTH is allowed — that is a retailer un-setting their hours, which
    // the constraint permits and the profile screen reads as "not chosen yet".
    if (open !== null || close !== null) {
      const nums = [open, close].map(Number);
      const bad =
        nums.some((n) => !Number.isInteger(n)) ||
        nums.some((n) => n < 8 || n > 20) ||
        nums[0] >= nums[1];
      if (bad) {
        return res.status(400).json({
          error: 'Shop hours must be whole hours between 8 AM and 8 PM, and open must be before close.',
        });
      }
      updates.shop_open_hour = nums[0];
      updates.shop_close_hour = nums[1];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
  }

  // Address → map pin, best-effort. A seller's farm pin (farm_lat/lng) is the pickup
  // origin on the tracking map. When the address changes and the seller did NOT drop
  // a pin themselves (and none is stored), geocode the address to fill it — so every
  // profile with an address gets a location even without "Pin current location". An
  // exact pin still needs the GPS button; this is the approximate fallback. Never
  // overwrites a real pin, and a geocode failure just leaves it unset.
  const ADDRESS_KEYS = [
    'house_no', 'street1', 'street2', 'landmark',
    'village_town', 'city', 'taluk', 'district', 'state', 'pincode',
  ];
  const addressChanged = ADDRESS_KEYS.some((k) => updates[k] !== undefined);
  const settingFarmPin = updates.farm_lat !== undefined || updates.farm_lng !== undefined;
  if (req.user.role === 'farmer' && addressChanged && !settingFarmPin && geocodingEnabled()) {
    const { data: cur, error: curErr } = await supabase
      .from('users')
      .select('house_no, street1, street2, landmark, village_town, city, taluk, district, state, pincode, farm_lat, farm_lng')
      .eq('id', req.user.id)
      .maybeSingle();
    if (curErr) {
      console.error('PATCH /me farm geocode read failed:', curErr.message);
    } else if (cur && cur.farm_lat == null && cur.farm_lng == null) {
      const geo = await geocodeAddress({ ...cur, ...updates });
      if (geo) {
        updates.farm_lat = geo.lat;
        updates.farm_lng = geo.lng;
      }
    }
  }

  // Consumer address book: geocode every saved delivery address that carries no pin
  // of its own, so each one maps to a location even without "Pin current location".
  // Entries the user already pinned (GPS) are left untouched. Bounded per save so a
  // large book can't fan out into unbounded geocode calls.
  if (
    updates.delivery_addresses !== undefined &&
    Array.isArray(updates.delivery_addresses) &&
    geocodingEnabled()
  ) {
    let budget = 10;
    const filled = [];
    for (const a of updates.delivery_addresses) {
      const needs =
        a &&
        typeof a === 'object' &&
        (a.lat == null || a.lng == null) &&
        (a.street1 || a.village_town || a.city || a.house_no);
      if (needs && budget > 0) {
        budget--;
        const geo = await geocodeAddress(a);
        if (geo) {
          filled.push({ ...a, lat: geo.lat, lng: geo.lng });
          continue;
        }
      }
      filled.push(a);
    }
    updates.delivery_addresses = filled;
  }

  updates.updated_at = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', req.user.id)
    .select()
    .single();

  if (error) {
    console.error('Update /me error:', error);
    return res.status(500).json({ error: 'Could not update profile.' });
  }

  res.json({ message: 'Profile updated.', user: await withPerms(updated) });
});

// ── POST /auth/profile-change-request ────────────────────────────────────────
// Farmer/retailer submits sensitive field changes for Head Office approval
const SENSITIVE_FIELDS = ['bank_name', 'bank_account', 'ifsc', 'gst_number', 'business_name', 'business_type'];

router.post('/profile-change-request', requireAuth, async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmer/retailer accounts can submit profile change requests.' });
  }

  const changes = {};
  for (const key of SENSITIVE_FIELDS) {
    if (req.body[key] !== undefined && req.body[key] !== '') changes[key] = req.body[key];
  }
  if (Object.keys(changes).length === 0) {
    return res.status(400).json({ error: 'No sensitive fields provided.' });
  }

  // limit(1), not maybeSingle: a user who ALREADY has two pending rows — which this
  // guard failing is exactly how they'd get them — would make maybeSingle raise
  // PGRST116 on every future attempt, locking them out of the feature permanently.
  const { data: existing, error: existingErr } = await supabase
    .from('profile_change_requests')
    .select('id')
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .limit(1);
  if (existingErr) {
    return res.status(500).json({ error: 'Could not check for an existing change request. Please try again.' });
  }
  if (existing && existing.length) {
    return res.status(409).json({ error: 'You already have a pending change request. Please wait for it to be reviewed before submitting another.' });
  }

  const { data: request, error } = await supabase
    .from('profile_change_requests')
    .insert({ user_id: req.user.id, login_id: req.user.login_id, fname: req.user.fname, requested_changes: changes })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  try { await notify.notifyProfileChangeRequest(req.user, changes); } catch(e) { console.error('Notify error:', e.message); }

  res.status(201).json({ message: 'Change request submitted. The Head Office team will review it shortly.', request });
});

// ── POST /auth/subscription-renewal ──────────────────────────────────────────
const VALID_PLANS = ['Monthly', 'Quarterly', 'Half Yearly', 'Yearly'];

router.post('/subscription-renewal', requireAuth, async (req, res) => {
  if (req.user.role !== 'farmer') {
    return res.status(403).json({ error: 'Only farmer/retailer accounts can request subscription renewal.' });
  }
  const { plan } = req.body;
  if (!plan || !VALID_PLANS.includes(plan)) {
    return res.status(400).json({ error: 'A valid plan is required: Monthly, Quarterly, Half Yearly, or Yearly.' });
  }

  const { data: pending, error: pendingErr } = await supabase
    .from('profile_change_requests')
    .select('id, requested_changes')
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .limit(1);
  if (pendingErr) {
    return res.status(500).json({ error: 'Could not check for an existing request. Please try again.' });
  }
  if (pending && pending.length) {
    const existing = pending[0];
    const isRenewal = existing.requested_changes && existing.requested_changes.subscription_renewal;
    return res.status(409).json({
      error: isRenewal
        ? 'You already have a pending renewal request. Please wait for it to be reviewed.'
        : 'You already have a pending change request. Please wait for it to be reviewed first.',
    });
  }

  const { data: request, error } = await supabase
    .from('profile_change_requests')
    .insert({
      user_id:            req.user.id,
      login_id:           req.user.login_id,
      fname:              req.user.fname,
      requested_changes:  { subscription_renewal: true, new_plan: plan },
    })
    .select()
    .single();
  if (error) return res.status(500).json({ error: error.message });

  try { await notify.notifySubscriptionRenewalRequest(req.user, plan); } catch(e) { console.error('Notify error:', e.message); }

  res.status(201).json({ message: 'Renewal request submitted. The Head Office team will review it shortly.', request });
});

// ── GET /auth/my-change-request ───────────────────────────────────────────────
router.get('/my-change-request', requireAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('profile_change_requests')
    .select('*')
    .eq('user_id', req.user.id)
    .order('requested_at', { ascending: false })
    .limit(5);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ requests: data || [] });
});

module.exports = router;
