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

function safeUser(u) {
  // Strip password_hash before returning to client
  const { password_hash, ...rest } = u;
  return rest;
}

// ── POST /auth/register ───────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const {
    phone, password, role,
    fname, lname, email, alt_phone,
    country_code,
    house_no, street1, street2, landmark,
    village_town, city, district, pincode, state, country,
    // farmer (Farmer type)
    aadhar, bank_name, bank_account, ifsc,
    // farmer (Retailer type)
    seller_type, business_name, gst_number, business_type,
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
    country_code: country_code || '+91',
    house_no, street1, street2, landmark,
    village_town, city, district, pincode,
    state, country: country || 'India',
    approval_status,
    ...(role === 'farmer' && { seller_type }),
    ...(role === 'farmer' && seller_type === 'Farmer'   && { aadhar, bank_name, bank_account, ifsc }),
    ...(role === 'farmer' && seller_type === 'Retailer' && { business_name, gst_number, business_type }),
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
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }
  if (user.status === 'blocked') {
    return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
  }

  // Seller-specific approval gate
  if (user.role === 'farmer') {
    if (user.approval_status === 'pending_review') {
      return res.status(403).json({ error: 'Your registration is under review by our team. You will be notified once approved.', approval_status: 'pending_review' });
    }
    if (user.approval_status === 'payment_pending') {
      return res.status(403).json({ error: `Your application is approved! Please complete the subscription payment (Ref: ${user.payment_reference}) to activate your account.`, approval_status: 'payment_pending', payment_reference: user.payment_reference });
    }
    if (user.approval_status === 'rejected') {
      return res.status(403).json({ error: `Your registration was not approved. ${user.rejection_reason ? 'Reason: ' + user.rejection_reason : 'Please contact support.'}`, approval_status: 'rejected' });
    }
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }

  const token = signToken(user.id);

  res.json({
    message: 'Login successful.',
    token,
    user: safeUser(user),
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
  if (record.otp !== otp) return res.status(400).json({ error: 'Incorrect OTP.' });

  otpStore.delete(phone);

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .single();

  const token = signToken(user.id);

  res.json({
    message: 'OTP verified. Login successful.',
    token,
    user: safeUser(user),
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

  const { fname, lname, phone, password, admin_role, district, state } = req.body;
  if (!fname || !phone || !password || !admin_role) {
    return res.status(400).json({ error: 'fname, phone, password, and admin_role are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
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
    district: district || req.user.district,
    state: state || req.user.state,
    country: 'India',
    country_code: '+91',
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
    'house_no', 'street1', 'street2', 'landmark',
    'village_town', 'city', 'district', 'pincode', 'state',
    'bank_name', 'bank_account', 'ifsc',              // farmer bank details
    'business_name', 'gst_number', 'business_type',   // retailer details
    'agent_vehicle',                                   // agent vehicle
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

module.exports = router;
