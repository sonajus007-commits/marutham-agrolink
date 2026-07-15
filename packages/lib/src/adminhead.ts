/* Admin Head dashboard domain — the pure bits behind GET /dashboard/adminhead.
 *
 * The Head Office control panel: employees, org-wide approvals, staff by role,
 * employees by department, audit/login activity. Company-wide — this endpoint has
 * no geo scope, unlike operations.
 *
 * Ported from frontend/js/dashboard/adminhead.js, the last dashboard that lived
 * only in the legacy frontend.
 *
 * MONEY: this endpoint returns no money at all. Nothing here formats currency.
 */

/** One row of the staff-by-role breakdown (`users` where role = 'admin'). */
export interface StaffRole {
  role: string;
  count: number;
}

/** One row of the employees-by-department breakdown (the `employees` table). */
export interface StaffDept {
  dept: string;
  count: number;
}

/**
 * Staff roles, biggest first.
 *
 * Rendered as a RANKED BAR, not the donut legacy used. There are ~15 admin_role
 * values and their counts are wildly unequal, so a pie would be asking the reader
 * to compare fifteen angles — and a fifteen-slice donut cannot deliver the
 * part-to-whole reading that is a pie's only honest job anyway. Comparing counts
 * across many categories is a bar's job. It also keeps the chart to ONE series,
 * so it needs no categorical palette: the brand's 6-hue chart palette fails CVD
 * and lightness validation past its 4th slot, and cycling hues to cover 15 roles
 * would have been worse than the chart it replaced.
 *
 * Ties break alphabetically so the order is stable between refreshes — two roles
 * with 3 staff each must not swap places just because PostgREST returned them in
 * a different order.
 */
export function rankedStaffRoles(rows: StaffRole[] | null | undefined): StaffRole[] {
  return [...(rows || [])]
    .map((r) => ({ role: r.role || 'Unassigned', count: Number(r.count || 0) }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
}

/** Departments, biggest first. Same reasoning and same stable tie-break. */
export function rankedDepartments(rows: StaffDept[] | null | undefined): StaffDept[] {
  return [...(rows || [])]
    .map((r) => ({ dept: r.dept || 'Unassigned', count: Number(r.count || 0) }))
    .sort((a, b) => b.count - a.count || a.dept.localeCompare(b.dept));
}

/** Total staff across every role — the whole that the ranked bars are parts of.
 *  The bar chart cannot show it, so the subtitle does. */
export function staffTotal(rows: StaffRole[] | null | undefined): number {
  return (rows || []).reduce((s, r) => s + Number(r.count || 0), 0);
}

export interface AdminHeadApprovals {
  employees_pending?: number;
  farmers_pending?: number;
  listings_pending?: number;
  /** Named `total_pending`, NOT `total`: a response key called `total` is eaten by
   *  the money middleware's MONEY_FIELDS and comes back as "0.00". */
  total_pending?: number;
}

export interface ApprovalQueueItem {
  /** i18n suffix — `admin.head.approvals.<key>`. */
  key: 'employees' | 'farmers' | 'listings';
  count: number;
  /**
   * The screen that works this queue.
   *
   * Nullable by design, and it earned that: produce listings were counted here with
   * NO door for a while, because the React console had no listing-approval screen
   * (legacy had a tab; it was never ported). Showing the count and withholding the
   * link was the honest option — a link to a route that does not exist is a worse
   * lie than an admitted gap. `/admin/listings` now exists, so every queue has a
   * door again. The type stays nullable so the next counted-but-unbuilt queue has
   * somewhere honest to land.
   */
  to: string | null;
}

/**
 * The approval backlog, biggest queue first.
 *
 * Every count is listed even when it is zero — this is a standing worklist, and
 * "0 farmers waiting" is a real, useful answer to "what is waiting on me?", not
 * noise. (Contrast the quick-action BADGES on operations, which hide their zero:
 * there the number is decoration on a link, not the point of the row.)
 */
export function approvalQueue(
  approvals: AdminHeadApprovals | null | undefined,
): ApprovalQueueItem[] {
  const a = approvals || {};
  const items: ApprovalQueueItem[] = [
    { key: 'employees', count: Number(a.employees_pending || 0), to: '/admin/employees' },
    { key: 'farmers', count: Number(a.farmers_pending || 0), to: '/admin/registrations' },
    { key: 'listings', count: Number(a.listings_pending || 0), to: '/admin/listings' },
  ];
  return items.sort((x, y) => y.count - x.count);
}
