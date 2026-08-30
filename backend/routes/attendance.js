const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');

const router = express.Router();
router.use(requireAuth);

// Who works shifts in the field. Only these roles check in/out for themselves.
const FIELD_ROLES = ['VCO', 'Delivery Agent', 'Hub Incharge', 'Hub Manager'];
const isFieldStaff = (u) => u.role === 'admin' && FIELD_ROLES.includes(u.admin_role);

// IST work day (the business runs in one timezone).
function istDate() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

const coordSchema = z
  .object({
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
  })
  .partial();

// ── POST /attendance/check-in ── mark on duty for today (idempotent) ─────────────
router.post('/check-in', validateBody(coordSchema), async (req, res) => {
  if (!isFieldStaff(req.user)) {
    return res.status(403).json({ error: 'Only field staff check in for duty.' });
  }
  const work_date = istDate();
  const row = {
    user_id: req.user.id,
    work_date,
    checked_in_at: new Date().toISOString(),
    checked_out_at: null, // a fresh check-in clears any earlier check-out that day
    district: req.user.district || null,
    admin_role: req.user.admin_role || null,
  };
  if (typeof req.body.lat === 'number') row.check_in_lat = req.body.lat;
  if (typeof req.body.lng === 'number') row.check_in_lng = req.body.lng;

  const { data, error } = await supabase
    .from('staff_attendance')
    .upsert(row, { onConflict: 'user_id,work_date' })
    .select()
    .single();
  if (error) {
    console.error('POST /attendance/check-in error:', error);
    return res.status(500).json({ error: 'Could not check in. Please try again.' });
  }
  res.json({ status: 'on_duty', attendance: data });
});

// ── POST /attendance/check-out ── mark off duty for today ────────────────────────
router.post('/check-out', async (req, res) => {
  if (!isFieldStaff(req.user)) {
    return res.status(403).json({ error: 'Only field staff check out.' });
  }
  const work_date = istDate();
  const { data, error } = await supabase
    .from('staff_attendance')
    .update({ checked_out_at: new Date().toISOString() })
    .eq('user_id', req.user.id)
    .eq('work_date', work_date)
    .not('checked_in_at', 'is', null)
    .select()
    .maybeSingle();
  if (error) {
    console.error('POST /attendance/check-out error:', error);
    return res.status(500).json({ error: 'Could not check out. Please try again.' });
  }
  if (!data) return res.status(400).json({ error: 'You have not checked in today.' });
  res.json({ status: 'off_duty', attendance: data });
});

// ── GET /attendance/me ── my duty status today ───────────────────────────────────
router.get('/me', async (req, res) => {
  const { data, error } = await supabase
    .from('staff_attendance')
    .select('*')
    .eq('user_id', req.user.id)
    .eq('work_date', istDate())
    .maybeSingle();
  if (error) {
    console.error('GET /attendance/me error:', error.message);
    return res.status(500).json({ error: 'Could not load your status.' });
  }
  const status = data && data.checked_in_at && !data.checked_out_at ? 'on_duty' : 'off_duty';
  res.json({ status, attendance: data || null });
});

// ── GET /attendance ── the manager view: who is on duty (attendance:view) ────────
// Optional ?date=YYYY-MM-DD (default today) and ?district=. Managers see their area.
router.get('/', async (req, res) => {
  if (!can(req.user, 'attendance', 'view')) {
    return res.status(403).json({ error: 'Attendance permission required.' });
  }
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : istDate();

  let q = supabase
    .from('staff_attendance')
    .select('user_id, work_date, checked_in_at, checked_out_at, district, admin_role, user:users ( fname, lname, phone )')
    .eq('work_date', date)
    .order('checked_in_at', { ascending: true });
  if (req.query.district) q = q.eq('district', req.query.district);

  const { data, error } = await q;
  if (error) {
    console.error('GET /attendance error:', error.message);
    return res.status(500).json({ error: 'Could not load attendance.' });
  }

  const rows = (data || []).map((a) => ({
    user_id: a.user_id,
    name: `${a.user?.fname || ''}${a.user?.lname ? ' ' + a.user.lname : ''}`.trim(),
    phone: a.user?.phone || null,
    role: a.admin_role,
    district: a.district,
    checked_in_at: a.checked_in_at,
    checked_out_at: a.checked_out_at,
    status: a.checked_in_at && !a.checked_out_at ? 'on_duty' : 'off_duty',
  }));
  const on_duty = rows.filter((r) => r.status === 'on_duty').length;
  // NOT `total` — the money middleware coerces a field named total (2 → "0.02").
  res.json({ date, on_duty, total_staff: rows.length, attendance: rows });
});

module.exports = router;
