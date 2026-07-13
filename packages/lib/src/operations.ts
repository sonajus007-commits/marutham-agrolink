/* Operations dashboard domain — the pure bits behind GET /dashboard/operations.
 *
 * Ported from frontend/js/dashboard/operations.js, which computed this inline in
 * a <script>. Pure and framework-free so it can be tested and reused.
 *
 * MONEY: every amount from this endpoint is ALREADY IN RUPEES — the route
 * converts paise itself and names the fields outside the money middleware's
 * MONEY_FIELDS set. Nothing here divides by 100.
 *
 * SCOPE is decided by the SERVER from the signed-in user (district / region /
 * all). The client never asks for a scope, so there is nothing here that could
 * widen one.
 */
import { PIPELINE_STAGES } from './pipeline';

export type OpsScopeLevel = 'district' | 'region' | 'all';

export interface DeliveryStage {
  status: string;
  count: number;
}

/**
 * The delivery-status breakdown, ordered along the ORDER PIPELINE.
 *
 * The API hands back a plain object keyed by status, so its key order is just
 * whichever status the server happened to see first — legacy fed exactly that
 * into the bar chart, which meant "Delivered" could sit left of "Packaged" and
 * the chart read as noise instead of a funnel. Ordering by PIPELINE_STAGES makes
 * the bars a pipeline: work enters at the left and leaves at the right, so a
 * pile-up is visible as a shape rather than a number you have to hunt for.
 *
 * A status the pipeline does not know (a new one, a typo in the DB) is NOT
 * dropped — it is appended, alphabetically, after the known stages. Those orders
 * exist and the manager needs to see them.
 */
export function deliveryStages(
  breakdown: Record<string, number> | null | undefined,
): DeliveryStage[] {
  const entries = Object.entries(breakdown || {}).map(([status, count]) => ({
    status,
    count: Number(count || 0),
  }));

  const rank = (s: string) => {
    const i = (PIPELINE_STAGES as readonly string[]).indexOf(s);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  return entries.sort((a, b) => {
    const ra = rank(a.status);
    const rb = rank(b.status);
    if (ra !== rb) return ra - rb;
    return a.status.localeCompare(b.status); // both unknown → stable, alphabetical
  });
}

/** How many orders are sitting in the pipeline, unfinished. */
export function totalInPipeline(stages: DeliveryStage[]): number {
  return stages.reduce((s, x) => s + (x.status === 'Delivered' ? 0 : x.count), 0);
}

export interface OpsDistrict {
  district: string;
  orders: number;
  revenue: number;
  pending: number;
}

/** Districts busiest first. The backend already sorts, but a view should not
 *  depend on an ordering it does not control. */
export function rankedOpsDistricts(rows: OpsDistrict[] | null | undefined): OpsDistrict[] {
  return [...(rows || [])].sort((a, b) => Number(b.orders || 0) - Number(a.orders || 0));
}

/* Alerts moved to ./alerts — `sortAlerts` and the severity→tone mapping are shared
 * with the executive and admin-head dashboards, which return the same alert shape.
 * `OpsAlert` is now `DashboardAlert`; `opsAlertTone` is now `alertTone`. */
