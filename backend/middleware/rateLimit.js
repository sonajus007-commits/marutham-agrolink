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

// For AUTHENTICATED write endpoints: key by the user (their id) when signed in,
// falling back to the IP subnet otherwise. A shared office/carrier IP therefore
// does not lump many real users into one bucket, and a single account cannot
// escape its budget by moving IPs. Only used AFTER requireAuth, so req.user is set.
const userOrIpKey = (req) =>
  req.user && req.user.id ? `u:${req.user.id}` : ipKeyGenerator(req.ip);

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

// Registration: mass-signup / resource abuse is the threat (each register can also
// trigger downstream work). Pre-auth, so keyed by IP subnet. 20 / hour.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  handler: (req, res, _next, opts) => tooMany(res, opts.windowMs),
});

// Order placement (checkout): checkout abuse / order flooding is the threat — each
// order runs the multi-vendor split, stock checks and payout wiring. Per user.
// 30 / 15 min is far above any real shopper.
const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, _next, opts) => tooMany(res, opts.windowMs),
});

// Payment: a payment call is the most sensitive write. Per user, 20 / 15 min.
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: userOrIpKey,
  handler: (req, res, _next, opts) => tooMany(res, opts.windowMs),
});

module.exports = {
  loginLimiter,
  otpLimiter,
  resetLimiter,
  registerLimiter,
  orderLimiter,
  paymentLimiter,
};
