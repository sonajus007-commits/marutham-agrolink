const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { toCsv, rupees } = require('../utils/csv');

const router = express.Router();
router.use(requireAuth);

// Exporting is the Reports & Export module's 'view' action — admin, the technical
// head and every tiered manager hold it. Read-only: these endpoints never write.
function requireExport(req, res, next) {
  if (!can(req.user, 'reports_export', 'view')) {
    return res.status(403).json({ error: 'Reports permission required.' });
  }
  next();
}

// A CSV download response. res.send (not res.json) so the money/redact middleware
// never touches the string, and the browser gets a real file.
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// Optional ?from=YYYY-MM-DD & ?to=YYYY-MM-DD on created_at, and ?district=.
function applyFilters(q, req) {
  const { from, to, district } = req.query;
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to + 'T23:59:59.999Z');
  if (district) q = q.eq('district', district);
  return q;
}

// ── GET /reports/orders.csv ──────────────────────────────────────────────────────
// Customer orders only (parent_order_id is null) so a multi-vendor order is one row.
router.get('/orders.csv', requireExport, async (req, res) => {
  let q = supabase
    .from('orders')
    .select('code, consumer_name, district, status, pay_method, pay_status, item_total, delivery, total, created_at, delivered_at')
    .is('parent_order_id', null)
    .order('created_at', { ascending: false })
    .limit(50000);
  q = applyFilters(q, req);

  const { data, error } = await q;
  if (error) {
    console.error('GET /reports/orders.csv failed:', error.message);
    return res.status(500).json({ error: 'Could not build the orders report.' });
  }

  const rows = (data || []).map((o) => ({
    code: o.code,
    consumer: o.consumer_name,
    district: o.district,
    status: o.status,
    pay_method: o.pay_method,
    pay_status: o.pay_status,
    item_total: rupees(o.item_total),
    delivery: rupees(o.delivery),
    total: rupees(o.total),
    placed: o.created_at,
    delivered: o.delivered_at,
  }));
  const headers = [
    { key: 'code', label: 'Order Code' },
    { key: 'consumer', label: 'Customer' },
    { key: 'district', label: 'District' },
    { key: 'status', label: 'Status' },
    { key: 'pay_method', label: 'Payment Method' },
    { key: 'pay_status', label: 'Payment Status' },
    { key: 'item_total', label: 'Items (Rs)' },
    { key: 'delivery', label: 'Delivery (Rs)' },
    { key: 'total', label: 'Total (Rs)' },
    { key: 'placed', label: 'Placed At' },
    { key: 'delivered', label: 'Delivered At' },
  ];
  sendCsv(res, 'orders.csv', toCsv(headers, rows));
});

// ── GET /reports/payouts.csv ──────────────────────────────────────────────────────
router.get('/payouts.csv', requireExport, async (req, res) => {
  const { from, to } = req.query;
  let q = supabase
    .from('payouts')
    .select('amount, status, method, created_at, farmer:users ( fname, lname, district, phone )')
    .order('created_at', { ascending: false })
    .limit(50000);
  if (from) q = q.gte('created_at', from);
  if (to) q = q.lte('created_at', to + 'T23:59:59.999Z');

  const { data, error } = await q;
  if (error) {
    console.error('GET /reports/payouts.csv failed:', error.message);
    return res.status(500).json({ error: 'Could not build the payouts report.' });
  }

  const district = (req.query.district || '').trim().toLowerCase();
  const rows = (data || [])
    .map((p) => ({
      farmer: `${p.farmer?.fname || ''}${p.farmer?.lname ? ' ' + p.farmer.lname : ''}`.trim(),
      district: p.farmer?.district || '',
      phone: p.farmer?.phone || '',
      amount: rupees(p.amount),
      status: p.status,
      method: p.method,
      created: p.created_at,
    }))
    .filter((r) => !district || r.district.toLowerCase() === district);
  const headers = [
    { key: 'farmer', label: 'Seller' },
    { key: 'district', label: 'District' },
    { key: 'phone', label: 'Phone' },
    { key: 'amount', label: 'Amount (Rs)' },
    { key: 'status', label: 'Status' },
    { key: 'method', label: 'Method' },
    { key: 'created', label: 'Created At' },
  ];
  sendCsv(res, 'payouts.csv', toCsv(headers, rows));
});

// ── GET /reports/users.csv ────────────────────────────────────────────────────────
router.get('/users.csv', requireExport, async (req, res) => {
  const { role, district } = req.query;
  let q = supabase
    .from('users')
    .select('login_id, fname, lname, role, seller_type, district, status, phone, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50000);
  if (role) q = q.eq('role', role);
  if (district) q = q.eq('district', district);

  const { data, error } = await q;
  if (error) {
    console.error('GET /reports/users.csv failed:', error.message);
    return res.status(500).json({ error: 'Could not build the users report.' });
  }

  const rows = (data || []).map((u) => ({
    login_id: u.login_id,
    name: `${u.fname || ''}${u.lname ? ' ' + u.lname : ''}`.trim(),
    role: u.role,
    seller_type: u.seller_type || '',
    district: u.district || '',
    status: u.status,
    phone: u.phone || '',
    joined: u.created_at,
  }));
  const headers = [
    { key: 'login_id', label: 'Login ID' },
    { key: 'name', label: 'Name' },
    { key: 'role', label: 'Role' },
    { key: 'seller_type', label: 'Seller Type' },
    { key: 'district', label: 'District' },
    { key: 'status', label: 'Status' },
    { key: 'phone', label: 'Phone' },
    { key: 'joined', label: 'Joined At' },
  ];
  sendCsv(res, 'users.csv', toCsv(headers, rows));
});

module.exports = router;
