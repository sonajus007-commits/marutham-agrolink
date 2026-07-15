/* Placeholder metrics — the tiles a dashboard shows for a number it cannot get.
 *
 * Every dashboard endpoint ships a `placeholders` array: the metrics its audience
 * asked for that no system feeds yet (EXEC_PLACEHOLDERS, OPS_PLACEHOLDERS,
 * FIELD_PLACEHOLDERS, ADMINHEAD_PLACEHOLDERS in backend/routes/dashboard.js). They
 * render as greyed "Needs integration" tiles — never as ₹0 or 0, because a
 * fabricated zero is worse than an admitted gap.
 *
 * THE API ARRAY IS THE SOURCE OF TRUTH, not this catalogue. The catalogue only
 * says how to DRESS a key (which group, which icon); it never decides whether a
 * key is shown. The day a metric gains a real data source and the backend drops
 * it from the array, its tile disappears on its own. The first version of the
 * executive dashboard hardcoded three tiles and ignored the array, and the two
 * immediately drifted apart — this module exists so that cannot recur.
 *
 * Lives outside executive.ts because it is shared: the executive and operations
 * dashboards both render from it, and field/adminhead can when they are ported.
 */

export type PlaceholderGroupId =
  'finance' | 'cost' | 'inventory' | 'logistics' | 'field' | 'satisfaction' | 'other';

/** Groups render in this order; `other` is the catch-all and always comes last. */
export const PLACEHOLDER_GROUP_ORDER: readonly PlaceholderGroupId[] = [
  'finance',
  'cost',
  'inventory',
  'logistics',
  'field',
  'satisfaction',
  'other',
];

const PLACEHOLDER_CATALOGUE: Readonly<Record<string, { group: PlaceholderGroupId; icon: string }>> =
  {
    // ── Executive (EXEC_PLACEHOLDERS) ──
    net_profit: { group: 'finance', icon: '💵' },
    ebitda: { group: 'finance', icon: '📊' },
    cash_flow: { group: 'finance', icon: '🏦' },
    revenue_forecast: { group: 'finance', icon: '📉' },
    receivables: { group: 'finance', icon: '📥' },
    payables: { group: 'finance', icon: '📤' },
    gst: { group: 'finance', icon: '🧾' },
    tds: { group: 'finance', icon: '🧮' },
    bank_balance: { group: 'finance', icon: '🏧' },
    daily_settlement: { group: 'finance', icon: '💳' },
    salary_cost: { group: 'cost', icon: '👥' },
    warehouse_cost: { group: 'cost', icon: '🏬' },
    hub_cost: { group: 'cost', icon: '🏪' },
    vehicle_utilization: { group: 'logistics', icon: '🚙' },
    fuel_cost: { group: 'logistics', icon: '⛽' },
    farmer_satisfaction: { group: 'satisfaction', icon: '😊' },
    customer_complaints: { group: 'satisfaction', icon: '📣' },
    hub_issues: { group: 'satisfaction', icon: '🛠️' },
    stock_shortage: { group: 'satisfaction', icon: '📦' },

    // ── Operations (OPS_PLACEHOLDERS) ──
    hub_stock: { group: 'inventory', icon: '🏬' },
    transfer_stock: { group: 'inventory', icon: '📦' },
    agents_online: { group: 'logistics', icon: '🛰️' },
    vco_attendance: { group: 'field', icon: '🗓️' },
    farmer_visits: { group: 'field', icon: '🚶' },

    // ── Admin Head (ADMINHEAD_PLACEHOLDERS) ──
    support_tickets: { group: 'satisfaction', icon: '🎫' },
    escalations: { group: 'satisfaction', icon: '🚨' },
    warehouse_utilization: { group: 'inventory', icon: '🏭' },
    inventory_stock: { group: 'inventory', icon: '📦' },

    // ── Field: VCO & Delivery Agent (FIELD_PLACEHOLDERS) ──
    todays_schedule: { group: 'field', icon: '🗓️' },
    gps_route: { group: 'field', icon: '🗺️' },
    daily_earnings: { group: 'finance', icon: '💰' },
    distance_travelled: { group: 'logistics', icon: '📍' },
    fuel_allowance: { group: 'logistics', icon: '⛽' },
  };

export interface PlaceholderMetric {
  /** The backend's key — also the i18n key suffix (`admin.ph.<key>`). */
  key: string;
  icon: string;
}

export interface PlaceholderGroup {
  id: PlaceholderGroupId;
  metrics: PlaceholderMetric[];
}

/**
 * The reported placeholders, dressed and grouped by theme for display.
 *
 * A key the catalogue has never heard of is NOT dropped — it lands in `other`
 * with a neutral icon. Silently swallowing it would put the UI right back to
 * disagreeing with the API, which is the bug this replaces.
 */
export function placeholderGroups(placeholders: string[] | null | undefined): PlaceholderGroup[] {
  const byGroup = new Map<PlaceholderGroupId, PlaceholderMetric[]>();

  for (const key of placeholders || []) {
    const entry = PLACEHOLDER_CATALOGUE[key];
    const id = entry?.group ?? 'other';
    const metrics = byGroup.get(id) ?? [];
    metrics.push({ key, icon: entry?.icon ?? '🔌' });
    byGroup.set(id, metrics);
  }

  return PLACEHOLDER_GROUP_ORDER.filter((id) => byGroup.has(id)).map((id) => ({
    id,
    metrics: byGroup.get(id)!,
  }));
}

/** `vehicle_utilization` → "Vehicle Utilization" — the label of last resort for
 *  a key with no translation, so an uncatalogued metric still reads as English. */
export function humanizeMetricKey(key: string): string {
  return key
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
