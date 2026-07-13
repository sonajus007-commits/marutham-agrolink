/* Executive dashboard domain — the pure bits behind GET /dashboard/executive.
 *
 * Ported from frontend/js/dashboard/executive.js + common.js, which computed all
 * of this inline in a <script>. Pure and framework-free so it can be tested and
 * shared (RN, a future report export) rather than living in JSX.
 *
 * MONEY: every amount from this endpoint is ALREADY IN RUPEES — the route
 * converts paise itself and names the fields outside the money middleware's
 * MONEY_FIELDS set. Nothing here divides by 100. (GET /dashboard's
 * `daily_trend[].revenue` IS paise; the two endpoints genuinely disagree.)
 */

/* Structural, declared here rather than imported: packages/lib depends on
 * @marutham/tokens and nothing else, so the domain stays usable without the API
 * client. api-client's ExecutiveDistrict is compatible by shape. */
export interface DistrictPerf {
  district: string;
  revenue: number;
  orders: number;
  /** Banded by revenue share against the peak district. */
  status?: string | null;
}

export type TrendMode = 'monthly' | 'quarterly' | 'yearly';

/** The trend granularities the endpoint accepts (?trend=). */
export const TREND_MODES: readonly TrendMode[] = ['monthly', 'quarterly', 'yearly'];

/* ── District names ──────────────────────────────────────────────────────────
 *
 * The DB and the GeoJSON spell two districts differently. If a name does not
 * match, ECharts silently paints that district as "no data" — a real district
 * with real revenue simply goes grey, and nothing errors. So the alias is not a
 * nicety; it is the difference between a correct map and a quietly wrong one.
 *
 * Keys are the DB spelling, values the GeoJSON spelling.
 */
export const DISTRICT_ALIAS: Readonly<Record<string, string>> = {
  Kanniyakumari: 'Kanyakumari',
  'The Nilgiris': 'Nilgiris',
};

const GEO_TO_DB: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DISTRICT_ALIAS).map(([db, geo]) => [geo, db]),
);

/** DB district name → the name the GeoJSON uses. */
export function geoDistrictName(dbName: string): string {
  return DISTRICT_ALIAS[dbName] || dbName;
}

/** A name off the map (GeoJSON spelling) → the DB district it refers to. */
export function dbDistrictName(geoName: string): string {
  return GEO_TO_DB[geoName] || geoName;
}

/** Find a district row from a name in EITHER spelling — what a map click gives you. */
export function findDistrict(
  districts: DistrictPerf[],
  name: string,
): DistrictPerf | null {
  const wanted = dbDistrictName(name).toLowerCase();
  return (
    districts.find(
      (d) =>
        d.district.toLowerCase() === wanted ||
        geoDistrictName(d.district).toLowerCase() === name.toLowerCase(),
    ) || null
  );
}

/* ── Encoding ────────────────────────────────────────────────────────────────
 *
 * The backend bands each district green/amber/red by its revenue share against
 * the peak district. That is STATE, not identity — so it wears the design
 * system's status roles and never a categorical series colour, and it always
 * ships with a text label (the legend), never colour alone.
 */
export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral';

export function districtTone(status: string | null | undefined): StatusTone {
  if (status === 'green') return 'success';
  if (status === 'amber') return 'warning';
  if (status === 'red') return 'danger';
  return 'neutral';
}

/** Alert severity → the same status vocabulary. */
export function alertTone(severity: string | null | undefined): StatusTone {
  if (severity === 'high') return 'danger';
  if (severity === 'medium') return 'warning';
  return 'neutral';
}

/** Which way a growth percentage points. 0 is flat, not "up". */
export type Direction = 'up' | 'down' | 'flat';

export function growthDirection(pct: number | null | undefined): Direction {
  const n = Number(pct ?? 0);
  if (!Number.isFinite(n) || n === 0) return 'flat';
  return n > 0 ? 'up' : 'down';
}

/** "+12.5%" / "−28.6%" / "0%" — sign always explicit, so a drop cannot read as a gain. */
export function formatGrowth(pct: number | null | undefined): string {
  const n = Number(pct ?? 0);
  if (!Number.isFinite(n) || n === 0) return '0%';
  // U+2212 minus, not a hyphen: at small sizes a hyphen is easy to miss entirely.
  return n > 0 ? `+${n}%` : `−${Math.abs(n)}%`;
}

/**
 * Districts ranked for the list beside the map, richest first.
 *
 * The list is not decoration — it is the map's TABLE VIEW. A choropleth encodes
 * with colour and position, both of which fail for a colourblind or screen-reader
 * user, and the map is the one thing that cannot render when the GeoJSON fails to
 * load. The ranking carries the same numbers in text, always.
 */
export function rankedDistricts(districts: DistrictPerf[] | null | undefined): DistrictPerf[] {
  return [...(districts || [])].sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0));
}

/* ── Placeholders ────────────────────────────────────────────────────────────
 *
 * The endpoint ships a `placeholders` array: the metrics the board asked for
 * that we have no data source for yet (EXEC_PLACEHOLDERS in
 * backend/routes/dashboard.js). They render as greyed "Needs integration" tiles
 * — never as ₹0, because a fabricated zero on a board dashboard is worse than an
 * admitted gap.
 *
 * The API array is the SOURCE OF TRUTH, not this catalogue. The catalogue only
 * says how to dress a key (which group, which icon); it never decides whether a
 * key is shown. So the day the backend grows a real source for `gst` and drops
 * it from the array, the tile disappears on its own — nobody has to remember to
 * come here and delete it. That is the whole point: the first version of this
 * screen hardcoded three tiles and ignored the array, and the array immediately
 * drifted out of sync with what the board actually saw.
 */
export type PlaceholderGroupId = 'finance' | 'cost' | 'logistics' | 'satisfaction' | 'other';

/** Groups render in this order; `other` is the catch-all and comes last. */
export const PLACEHOLDER_GROUP_ORDER: readonly PlaceholderGroupId[] = [
  'finance', 'cost', 'logistics', 'satisfaction', 'other',
];

const PLACEHOLDER_CATALOGUE: Readonly<Record<string, { group: PlaceholderGroupId; icon: string }>> = {
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
};

export interface PlaceholderMetric {
  /** The backend's key — also the i18n key suffix (`admin.exec.ph.<key>`). */
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
