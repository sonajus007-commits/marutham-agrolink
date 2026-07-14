// Rate limiters for the credential endpoints.
//
// WHY. Login, OTP-send and password-reset accepted unlimited attempts. That is an open
// door to two attacks: brute-forcing a password, and OTP-bombing a real person's phone
// (each /send-otp fires an SMS/email to someone). A limiter turns both from "unbounded"
// into "a handful, then wait".
//
// KEY. By IP *and* the identifier being targeted, so one attacker cannot exhaust the
// budget for an unrelated victim, and one victim's own retries don't lock the whole IP.
// The identifier is read from the body (phone/login_id) and bounded, so a hostile body
// cannot blow up the key.
//
// These are in-memory (the default store). For a single API process that is correct and
// has no external dependency; if this is ever scaled to multiple processes, the limiter
// needs a shared store (Redis) — noted as a post-UAT item, not a UAT blocker.

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// The IP half of the key MUST go through ipKeyGenerator, not raw req.ip. A raw IPv6
// address is a full /128, so an attacker on an IPv6 block gets a fresh key for every
// address they hold and sails past the limit; ipKeyGenerator normalises it to a subnet.
// (express-rate-limit v8 refuses to start with a raw-IP custom key for exactly this.)
const identifierKey = (req) => {
  const id = (req.body && (req.body.phone || req.body.login_id)) || '';
  return `${ipKeyGenerator(req.ip)}:${String(id).slice(0, 64)}`;
};

const tooMany = (res, retryMs) => res.status(429).json({
  error: 'Too many attempts. Please wait a minute and try again.',
  retry_after_seconds: Math.ceil(retryMs / 1000),
});

// Password login: brute-force is the threat. 10 tries / 15 min per IP+identifier.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: identifierKey,
  handler: (req, res, _next, opts) => tooMany(res, opts.windowMs),
});

// OTP send: each call costs a real SMS/email to the target. Tighter — 5 / 15 min.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: identifierKey,
  handler: (req, res, _next, opts) => tooMany(res, opts.windowMs),
});

// Password reset: guessing the OTP is the threat. 10 / 15 min.
const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: identifierKey,
  handler: (req, res, _next, opts) => tooMany(res, opts.windowMs),
});

module.exports = { loginLimiter, otpLimiter, resetLimiter };
