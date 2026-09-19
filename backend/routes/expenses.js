const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');
const { EXPENSE_CATEGORIES, expenseSummary } = require('../utils/expenses');

const router = express.Router();
router.use(requireAuth);

const createSchema = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  // Rupees as the user types them; stored as paise. Positive, bounded so a fat-finger
  // paste can't book a crore.
  amount: z.coerce.number().positive().max(1e9),
  // YYYY-MM-DD; defaults to today when omitted.
  incurred_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendor: z.string().trim().max(200).optional(),
  note: z.string().trim().max(1000).optional(),
});

const fullName = (u) => `${u?.fname || ''}${u?.lname ? ' ' + u.lname : ''}`.trim();

// ── POST /expenses ── record an expense (payments:create → Finance / Admin) ───────
router.post('/', validateBody(createSchema), async (req, res) => {
  if (!can(req.user, 'payments', 'create')) {
    return res.status(403).json({ error: 'Recording expenses needs a payments-create permission.' });
  }
  const { category, amount, incurred_on, vendor, note } = req.body;
  const row = {
    category,
    amount: Math.round(amount * 100), // rupees → paise
    incurred_on: incurred_on || undefined, // let the column default to today
    vendor: vendor || null,
    note: note || null,
    created_by: req.user.id,
    created_by_name: fullName(req.user) || null,
  };
  const { data, error } = await supabase.from('expenses').insert(row).select().single();
  if (error) {
    console.error('POST /expenses error:', error.message);
    return res.status(500).json({ error: 'Could not record the expense. Please try again.' });
  }
  res.status(201).json({ expense: data });
});

// ── GET /expenses ── the ledger list + period summary (payments:view) ─────────────
// Optional ?month=YYYY-MM (default: current month) and ?category=.
router.get('/', async (req, res) => {
  if (!can(req.user, 'payments', 'view')) {
    return res.status(403).json({ error: 'Payments-view permission required.' });
  }
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '')
    ? req.query.month
    : new Date().toISOString().slice(0, 7);
  const from = `${month}-01`;
  // First day of the next month — an exclusive upper bound, no end-of-month maths.
  const [y, m] = month.split('-').map(Number);
  const to = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1)).toISOString().slice(0, 10);

  let q = supabase
    .from('expenses')
    .select('id, category, amount, incurred_on, vendor, note, created_by_name, created_at')
    .gte('incurred_on', from)
    .lt('incurred_on', to)
    .order('incurred_on', { ascending: false });
  if (req.query.category) q = q.eq('category', req.query.category);

  const { data, error } = await q;
  if (error) {
    console.error('GET /expenses error:', error.message);
    return res.status(500).json({ error: 'Could not load expenses.' });
  }
  // Summarise the RAW paise rows, then convert to rupees under money-SAFE key names.
  // `total` is a money-middleware field, so it would be double-handled if we shipped
  // it raw — we expose `spent` instead, already in rupees, and the middleware leaves
  // these keys (and the category names) alone.
  const sm = expenseSummary(data || []);
  const toR = (paise) => Math.round(Number(paise || 0)) / 100;
  const summary = {
    spent:      toR(sm.total),
    operating:  toR(sm.operating),
    below_line: toR(sm.below_line),
    by_category: Object.fromEntries(Object.entries(sm.by_category).map(([k, v]) => [k, toR(v)])),
  };
  res.json({ month, expenses: data || [], summary });
});

// ── DELETE /expenses/:id ── remove a mistaken entry (payments:delete) ─────────────
router.delete('/:id', async (req, res) => {
  if (!can(req.user, 'payments', 'delete')) {
    return res.status(403).json({ error: 'Deleting an expense needs a payments-delete permission.' });
  }
  const { error } = await supabase.from('expenses').delete().eq('id', req.params.id);
  if (error) {
    console.error('DELETE /expenses error:', error.message);
    return res.status(500).json({ error: 'Could not delete the expense.' });
  }
  res.json({ ok: true });
});

module.exports = router;
