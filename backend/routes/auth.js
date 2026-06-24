const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateLoginId(role, district) {
  const roleCode = { consumer: 'CNT', farmer: 'FRM', admin: 'ADM' }[role] || 'USR';
  const distCode = (district || 'GEN').replace(/\s+/g, '').slice(0, 4).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${roleCode}${distCode}_${suffix}`;
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
    // farmer-only
    aadhar, bank_name, bank_account, ifsc,
  } = req.body;

  if (!phone || !password || !role || !fname) {
    return res.status(400).json({ error: 'phone, password, role, and fname are required.' });
  }
  if (!['consumer', 'farmer'].includes(role)) {
    return res.status(400).json({ error: 'role must be consumer or farmer.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  // Check duplicate phone
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (existing) {
    return res.status(409).json({ error: 'An account with this phone number already exists.' });
  }

  const password_hash = await bcrypt.hash(password, 12);
  const login_id = generateLoginId(role, district);

  const newUser = {
    login_id, phone, password_hash, role,
    fname, lname, email, alt_phone,
    country_code: country_code || '+91',
    house_no, street1, street2, landmark,
    village_town, city, district, pincode,
    state, country: country || 'India',
    ...(role === 'farmer' && { aadhar, bank_name, bank_account, ifsc }),
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

  res.status(201).json({
    message: 'Account created successfully.',
    login_id: created.login_id,
    user: safeUser(created),
  });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: 'phone and password are required.' });
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('phone', phone)
    .maybeSingle();

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid phone number or password.' });
  }
  if (user.status === 'blocked') {
    return res.status(403).json({ error: 'Your account has been blocked. Contact support.' });
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
    'bank_name', 'bank_account', 'ifsc',  // farmer bank details
    'agent_vehicle',                        // agent vehicle
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
