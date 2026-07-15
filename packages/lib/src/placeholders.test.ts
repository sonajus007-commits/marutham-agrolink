import { describe, it, expect } from 'vitest';
import { placeholderGroups, humanizeMetricKey } from './placeholders';

/* The real arrays the backend ships (EXEC_PLACEHOLDERS / OPS_PLACEHOLDERS in
 * backend/routes/dashboard.js). Pinned here so that if the backend grows a
 * metric the catalogue has not been taught, the "uncatalogued" test below is
 * what tells us — loudly — rather than a mystery 🔌 tile in production. */
const EXEC = [
  'net_profit',
  'ebitda',
  'cash_flow',
  'revenue_forecast',
  'receivables',
  'payables',
  'gst',
  'tds',
  'bank_balance',
  'daily_settlement',
  'salary_cost',
  'warehouse_cost',
  'hub_cost',
  'vehicle_utilization',
  'fuel_cost',
  'farmer_satisfaction',
  'customer_complaints',
  'hub_issues',
  'stock_shortage',
];
const OPS = ['hub_stock', 'farmer_visits', 'vco_attendance', 'agents_online', 'transfer_stock'];

describe('placeholderGroups', () => {
  it('groups the reported metrics by theme, in display order', () => {
    const groups = placeholderGroups([
      'fuel_cost',
      'net_profit',
      'hub_issues',
      'salary_cost',
      'ebitda',
      'hub_stock',
    ]);
    // Finance → cost → inventory → logistics → satisfaction, regardless of the
    // order the API happened to list them in.
    expect(groups.map((g) => g.id)).toEqual([
      'finance',
      'cost',
      'inventory',
      'logistics',
      'satisfaction',
    ]);
    expect(groups[0].metrics.map((m) => m.key)).toEqual(['net_profit', 'ebitda']);
    expect(groups[0].metrics[0].icon).toBe('💵');
  });

  it('renders every metric the API reports and no metric it does not', () => {
    // The API array is the source of truth: a key it omits must not appear.
    const groups = placeholderGroups(['net_profit']);
    expect(groups.flatMap((g) => g.metrics).map((m) => m.key)).toEqual(['net_profit']);
  });

  it('has a home for every EXECUTIVE placeholder the backend actually ships', () => {
    const groups = placeholderGroups(EXEC);
    expect(groups.flatMap((g) => g.metrics)).toHaveLength(EXEC.length);
    expect(groups.find((g) => g.id === 'other')).toBeUndefined();
  });

  it('has a home for every OPERATIONS placeholder the backend actually ships', () => {
    const groups = placeholderGroups(OPS);
    expect(groups.flatMap((g) => g.metrics)).toHaveLength(OPS.length);
    // hub_stock/transfer_stock are inventory, agents_online logistics,
    // vco_attendance/farmer_visits field — none should fall through to "other".
    expect(groups.map((g) => g.id)).toEqual(['inventory', 'logistics', 'field']);
  });

  it('keeps an uncatalogued key instead of silently dropping it', () => {
    const groups = placeholderGroups(['net_profit', 'churn_risk']);
    const other = groups.find((g) => g.id === 'other');
    expect(other?.metrics).toEqual([{ key: 'churn_risk', icon: '🔌' }]);
  });

  it('is empty when the backend reports nothing missing', () => {
    expect(placeholderGroups([])).toEqual([]);
    expect(placeholderGroups(undefined)).toEqual([]);
  });
});

describe('humanizeMetricKey', () => {
  it('is the label of last resort for an untranslated key', () => {
    expect(humanizeMetricKey('vehicle_utilization')).toBe('Vehicle Utilization');
    expect(humanizeMetricKey('gst')).toBe('Gst');
  });
});
