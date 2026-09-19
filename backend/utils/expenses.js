// Pure helpers for the operating-expense ledger (migration 062). No DB import, so the
// dashboard route and the tests can pull `expenseSummary` without booting supabase.

// The closed set of expense categories. The three BELOW_THE_LINE ones are excluded from
// EBITDA (earnings BEFORE interest, tax, depreciation) but included in net profit.
const EXPENSE_CATEGORIES = [
  'salary', 'hub', 'fuel', 'vehicle', 'packaging', 'marketing', 'tech', 'office',
  'tax', 'interest', 'depreciation', 'other',
];
const BELOW_THE_LINE = new Set(['tax', 'interest', 'depreciation']);

/**
 * Summarise expense rows (amounts in PAISE) into the cuts the dashboards need:
 *   total       — every expense (→ net profit = revenue − total)
 *   operating   — total minus below-the-line (→ EBITDA = revenue − operating)
 *   below_line  — tax + interest + depreciation
 *   by_category — { salary, hub, fuel, … } in paise
 */
function expenseSummary(rows) {
  const by_category = {};
  let total = 0;
  let below_line = 0;
  for (const r of rows || []) {
    const amt = Number(r.amount || 0);
    total += amt;
    by_category[r.category] = (by_category[r.category] || 0) + amt;
    if (BELOW_THE_LINE.has(r.category)) below_line += amt;
  }
  return { total, operating: total - below_line, below_line, by_category };
}

module.exports = { EXPENSE_CATEGORIES, BELOW_THE_LINE, expenseSummary };
