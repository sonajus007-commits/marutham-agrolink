/* Navigation model for the Admin / management console. Kept as plain data so it
 * stays declarative and testable: AdminPage turns it into <Sidebar> sections,
 * role-filtering with filterNavByRole and wiring each item for SPA navigation.
 *
 * `to` is the router path (no basename); the sidebar href is APP_BASE + to so a
 * real anchor / middle-click still resolves under the /app mount. */

import { HUB_STAFF_ROLES } from '@marutham/lib';

export const APP_BASE = '/app';

/** admin_role values that use THIS console. Delivery Agent + VCO have /agent.
 *
 * This list is the DOOR to /admin/*, so anything missing from it is not merely
 * hidden — it is locked out. CEO/MD/CFO/CTO were missing while `roleHome()` sent
 * them to /admin/executive and the backend's EXECUTIVE_ROLES let them read it:
 * they would have been bounced straight back to /login with nowhere to land.
 * Zonal Manager was missing while the backend's OPS_REGION_ROLES let them read
 * the operations dashboard. No such user exists in the DB yet, which is the only
 * reason nobody has hit this.
 *
 * Rule: if a backend dashboard guard admits an admin_role, that role belongs
 * here. */
export const MANAGEMENT_ADMIN_ROLES = [
  'Head Office', 'State Head', 'Regional Manager', 'District Manager',
  'Hub Incharge', 'Board of Director', 'Zonal Manager',
  'CEO', 'Managing Director', 'CFO', 'CTO',
] as const;

/* Who may read a record's audit trail and login history. Mirrors the backend's
 * isHeadOffice() (routes/users.js), which — despite the name — admits State
 * Head as well; anyone else gets a 403. Gate the UI with this so a scoped admin
 * never opens a tab that can only fail. */
export const AUDIT_ADMIN_ROLES = ['Head Office', 'State Head'] as const;

export function canSeeAudit(adminRole?: string | null): boolean {
  return AUDIT_ADMIN_ROLES.includes(adminRole as (typeof AUDIT_ADMIN_ROLES)[number]);
}

/* Who may open the executive dashboard. MIRRORS the backend's EXECUTIVE_ROLES
 * (routes/dashboard.js) exactly — anyone else gets a 403, so showing them the
 * nav item would only offer a door that cannot open.
 *
 * Head Office is on the list for PREVIEW: they are not the audience, but they
 * run the company and legacy let them look. The pure executive roles below are
 * the ones the dashboard is FOR, and the ones roleHome() lands there. */
export const EXECUTIVE_ADMIN_ROLES = [
  'Board of Director', 'CEO', 'Managing Director', 'CFO', 'CTO', 'Head Office',
] as const;

export function canSeeExecutive(adminRole?: string | null): boolean {
  return EXECUTIVE_ADMIN_ROLES.includes(adminRole as (typeof EXECUTIVE_ADMIN_ROLES)[number]);
}

/* Roles whose HOME is the executive dashboard — EXECUTIVE_ADMIN_ROLES minus Head
 * Office. The board's job IS the business overview, so signing in should land
 * them on it, exactly as legacy admin.html did. Head Office runs every section
 * and keeps the operational Overview as their home; they reach this one from the
 * sidebar. */
export const EXECUTIVE_HOME_ROLES = [
  'Board of Director', 'CEO', 'Managing Director', 'CFO', 'CTO',
] as const;

export function homesOnExecutive(adminRole?: string | null): boolean {
  return EXECUTIVE_HOME_ROLES.includes(adminRole as (typeof EXECUTIVE_HOME_ROLES)[number]);
}

/* Who may open the operations dashboard. MIRRORS the backend's OPS_DISTRICT_ROLES
 * ∪ OPS_REGION_ROLES ∪ OPS_ALL_ROLES (routes/dashboard.js). The SERVER decides the
 * scope from the signed-in user — a District Manager sees their district, a
 * Regional/State/Zonal their state, Head Office everything — so the client never
 * passes a scope and cannot widen its own. */
export const OPERATIONS_ADMIN_ROLES = [
  'District Manager', 'Hub Incharge',
  'Regional Manager', 'State Head', 'Zonal Manager',
  'Head Office',
] as const;

export function canSeeOperations(adminRole?: string | null): boolean {
  return OPERATIONS_ADMIN_ROLES.includes(adminRole as (typeof OPERATIONS_ADMIN_ROLES)[number]);
}

/* Roles whose HOME is the operations dashboard. Legacy admin.html dispatched
 * these roles' Overview to the operations screen, so this restores where they
 * used to land.
 *
 * Two deliberate omissions: HUB INCHARGE keeps /admin/hub (their job is the hub
 * queue, and that landing predates this dashboard), and HEAD OFFICE keeps the
 * generic Overview — they run every section and reach this from the sidebar,
 * exactly as with the executive dashboard. */
export const OPERATIONS_HOME_ROLES = [
  'District Manager', 'Regional Manager', 'State Head', 'Zonal Manager',
] as const;

export function homesOnOperations(adminRole?: string | null): boolean {
  return OPERATIONS_HOME_ROLES.includes(adminRole as (typeof OPERATIONS_HOME_ROLES)[number]);
}

export interface AdminNavItem {
  id: string;
  labelKey: string;
  icon: string;
  to: string;
  /** admin_roles that may see this. Omitted = every management role. */
  roles?: readonly string[];
}

export interface AdminNavSection {
  id: string;
  labelKey?: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV: AdminNavSection[] = [
  {
    id: 'operations',
    items: [
      { id: 'overview', labelKey: 'admin.nav.overview', icon: '📊', to: '/admin' },
      // The board's dashboard. Existed only in legacy admin.html until now, so
      // every admin_role — the Board included — was landing on Overview instead.
      {
        id: 'executive', labelKey: 'admin.nav.executive', icon: '🏛️',
        to: '/admin/executive', roles: [...EXECUTIVE_ADMIN_ROLES],
      },
      // The operational managers' dashboard — district/region scoped by the server.
      {
        id: 'operations', labelKey: 'admin.nav.operations', icon: '🚚',
        to: '/admin/operations', roles: [...OPERATIONS_ADMIN_ROLES],
      },
      { id: 'orders', labelKey: 'admin.nav.orders', icon: '📦', to: '/admin/orders' },
      // Hub floor work. Board of Director is management, not operations — and the
      // /scan endpoint would refuse them, so they do not get the item.
      { id: 'hub', labelKey: 'admin.nav.hub', icon: '🏭', to: '/admin/hub', roles: [...HUB_STAFF_ROLES] },
      { id: 'returns', labelKey: 'admin.nav.returns', icon: '↩️', to: '/admin/returns' },
      { id: 'payouts', labelKey: 'admin.nav.payouts', icon: '💸', to: '/admin/payouts' },
      { id: 'users', labelKey: 'admin.nav.users', icon: '👥', to: '/admin/users' },
    ],
  },
  {
    id: 'approvals',
    labelKey: 'admin.nav.approvals',
    items: [
      { id: 'registrations', labelKey: 'admin.nav.registrations', icon: '📋', to: '/admin/registrations' },
      // Approving a change request writes bank/GST fields, so it is Head Office only
      // — matching backend isHeadOffice on POST /users/change-requests/:id/approve.
      { id: 'change-requests', labelKey: 'admin.nav.changeRequests', icon: '📝', to: '/admin/change-requests', roles: ['Head Office'] },
    ],
  },
  {
    id: 'people',
    labelKey: 'admin.nav.people',
    items: [
      // The employee tracker is HR-owned. Head Office / State Head always have it;
      // a Board of Director does too. HR-Admin-flagged staff with another role reach
      // it by deep link (the page and backend both enforce the real authority).
      { id: 'employees', labelKey: 'admin.nav.employees', icon: '🧑‍💼', to: '/admin/employees', roles: ['Head Office', 'State Head', 'Board of Director'] },
    ],
  },
  {
    id: 'catalog',
    labelKey: 'admin.nav.catalog',
    items: [
      { id: 'products', labelKey: 'admin.nav.products', icon: '🌾', to: '/admin/products' },
    ],
  },
];
