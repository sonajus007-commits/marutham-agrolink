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
