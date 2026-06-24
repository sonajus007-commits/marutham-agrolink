const jwt = require('jsonwebtoken');
const supabase = require('../db/supabase');

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
    .select('id, login_id, phone, role, admin_role, status, fname, lname, email, district, village_town, vco_city, district_assign, agent_vehicle')
    .eq('id', payload.sub)
    .single();

  if (error || !user) return res.status(401).json({ error: 'User not found.' });
  if (user.status === 'blocked') return res.status(403).json({ error: 'Account is blocked.' });

  req.user = user;
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

module.exports = { requireAuth, requireRole };
