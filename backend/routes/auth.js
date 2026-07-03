const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { distCode, stateCode } = require('../utils/codeGen');
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
};

// State-level roles have no district segment in their login ID.
const STATE_LEVEL_ROLES = new Set(['Regional Manager', 'State Head', 'Head Office']);

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

// Record a login attempt (success or failure) for audit/quality tracing.
// Best-effort — never blocks or fails the login flow.
async function logLogin(req, { user_id = null, login_id = null, method, outcome }) {
  try {
    const xff = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const ip  = xff || (req.socket && req.socket.remoteAddress) || null;
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

// If a seller's subscription has lapsed, drop them to 'suspended' so they can
// still log in and renew (renewals pay the plan fee only — no ₹100). Mutates
// `user` in place and records the change. Returns true if it suspended them.
async function maybeSuspendOnExpiry(user) {
  if (user.role === 'farmer' && user.status === 'active' && user.subscription_expires_at
      && new Date(user.subscription_expires_at) < new Date()) {
    await supabase.from('users')
      .update({ status: 'suspended', updated_at: new Date().toISOString() })
      .eq('id', user.id);
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
  // 'suspended' sellers may log in, but must pay before the home page unlocks.
  return { ok: true, needsPayment: user.role === 'farmer' && user.status === 'suspended' };
}

// ── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
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

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'An account with this phone number already exists.' });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const login_id = await generateLoginId(role, req.body.admin_role, state, district, fname, seller_type);

  // Farmers and retailers go into pending review; consumers are immediately active
  const approval_status = role === 'farmer' ? 'pending_review' : 'active';

  const newUser = {
    login_id, phone, password_hash, role,
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
    user: safeUser(created),
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'Phone/Login ID and password are required.' });
  }

  // Accept either phone number or login_id in the phone field
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .or(`phone.eq.${phone},login_id.eq.${phone}`)
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

  // Lapsed subscription → suspend (they can still log in to renew).
  await maybeSuspendOnExpiry(user);

  const access = evaluateAccess(user);
  if (!access.ok) {
    const outcome = user.status === 'blocked' ? 'blocked' : (user.approval_status || 'rejected');
    await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'password', outcome });
    return res.status(access.code).json(access.body);
  }

  await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'password', outcome: 'success' });

  const token = signToken(user.id);
  res.json({
    message: 'Login successful.',
    token,
    user: safeUser(user),
    needs_payment: access.needsPayment,
  });
});

// ── POST /auth/send-otp ───────────────────────────────────────────────────────
// Sandbox: OTP is logged to console and returned in response (not in production).
const otpStore = new Map(); // phone → { otp, expiresAt }

router.post('/send-otp', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'phone is required.' });

  const { data: user } = await supabase
    .from('users')
    .select('id, status')
    .eq('phone', phone)
    .maybeSingle();

  if (!user) return res.status(404).json({ error: 'No account found with this phone number.' });
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

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();

  if (!user) {
    await logLogin(req, { login_id: phone, method: 'otp', outcome: 'invalid_credentials' });
    return res.status(401).json({ error: 'Account not found.' });
  }

  // Lapsed subscription → suspend, then apply the same access gate as password login.
  await maybeSuspendOnExpiry(user);
  const access = evaluateAccess(user);
  if (!access.ok) {
    const outcome = user.status === 'blocked' ? 'blocked' : (user.approval_status || 'rejected');
    await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'otp', outcome });
    return res.status(access.code).json(access.body);
  }

  await logLogin(req, { user_id: user.id, login_id: user.login_id, method: 'otp', outcome: 'success' });

  const token = signToken(user.id);
  res.json({
    message: 'OTP verified. Login successful.',
    token,
    user: safeUser(user),
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

  const { data: fullUser } = await supabase
    .from('users')
    .select('password_hash')
    .eq('id', req.user.id)
    .single();

  const ok = await bcrypt.compare(current_password, fullUser.password_hash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

  const password_hash = await bcrypt.hash(new_password, 12);
  const { error } = await supabase
    .from('users')
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('id', req.user.id);

  if (error) return res.status(500).json({ error: 'Could not update password.' });
  res.json({ message: 'Password changed successfully.' });
});

// ── POST /auth/reset-password ────────────────────────────────────────────────
// Body: { phone, otp, new_password }
// Uses the same OTP previously sent via /send-otp
router.post('/reset-password', async (req, res) => {
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
  const { error } = await supabase
    .from('users')
    .update({ password_hash, updated_at: new Date().toISOString() })
    .eq('phone', phone);

  if (error) return res.status(500).json({ error: 'Could not reset password.' });

  res.json({ message: 'Password reset successfully. You can now login.' });
});

// ── POST /auth/create-staff ───────────────────────────────────────────────────
// Admin creates a VCO / Delivery Agent / District Manager / Hub Incharge / RM / SH account
const CREATABLE_BY = {
  'Head Office':      ['VCO','Delivery Agent','District Manager','Hub Incharge','Regional Manager','State Head','Head Office'],
  'State Head':       ['VCO','Delivery Agent','District Manager','Hub Incharge','Regional Manager'],
  'Regional Manager': ['VCO','Delivery Agent','District Manager','Hub Incharge'],
  'District Manager': ['VCO','Delivery Agent'],
};

router.post('/create-staff', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const { fname, lname, phone, password, admin_role, district, state, gender, village_town, taluk, city, pincode } = req.body;
  if (!fname || !phone || !password || !admin_role) {
    return res.status(400).json({ error: 'fname, phone, password, and admin_role are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  // Village/Town decides which orders a VCO / Delivery Agent handles — required for those roles.
  if ((admin_role === 'VCO' || admin_role === 'Delivery Agent') && !village_town) {
    return res.status(400).json({ error: 'village_town is required for VCO and Delivery Agent.' });
  }

  const allowed = CREATABLE_BY[req.user.admin_role] || [];
  if (!allowed.includes(admin_role)) {
    return res.status(403).json({ error: `Your role (${req.user.admin_role}) cannot create ${admin_role} accounts.` });
  }

  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();
  if (existing) return res.status(409).json({ error: 'A user with this phone number already exists.' });

  const password_hash = await bcrypt.hash(password, 12);
  const login_id = await generateLoginId('admin', admin_role, state || req.user.state, district || req.user.district, fname);

  const newUser = {
    login_id, phone, password_hash,
    role: 'admin', admin_role,
    fname, lname: lname || '',
    gender: gender || null,
    district: district || req.user.district,
    state: state || req.user.state,
    country: 'India',
    country_code: '+91',
    ...(taluk ? { taluk } : {}),
    ...(city ? { city } : {}),
    ...(pincode ? { pincode } : {}),
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
    user: safeUser(created),
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

  res.json({ user: safeUser(user) });
});

// ── PATCH /me ─────────────────────────────────────────────────────────────────
router.patch('/me', requireAuth, async (req, res) => {
  // Fields a user can update on their own profile
  const ALLOWED = [
    'fname', 'lname', 'email', 'alt_phone',
    'gender',
    'house_no', 'street1', 'street2', 'landmark',
    'village_town', 'city', 'taluk', 'district', 'pincode', 'state',
    'agent_vehicle',                                   // agent vehicle
    'service_villages',                                // Delivery Agent: villages they cover (text[])
    'delivery_addresses',                              // consumer address book (JSONB array)
  ];

  const updates = {};
  for (const key of ALLOWED) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
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

  res.json({ message: 'Profile updated.', user: safeUser(updated) });
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

  const { data: existing } = await supabase
    .from('profile_change_requests')
    .select('id')
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
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

  const { data: existing } = await supabase
    .from('profile_change_requests')
    .select('id, requested_changes')
    .eq('user_id', req.user.id)
    .eq('status', 'pending')
    .maybeSingle();
  if (existing) {
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
