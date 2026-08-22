/* Navigation model for the Admin / management console.
 *
 * RBAC-DRIVEN. Every item declares what CAPABILITY it needs — a module+action, or
 * a composite dashboard flag — and filterAdminNav() hides the items the signed-in
 * user's permission map (from GET /auth/me) does not grant. There are no admin_role
 * lists here any more: the backend seeds the matrix, ships each user their resolved
 * permissions, and this file simply reflects them, so the two can never drift.
 */

import type { User } from '@marutham/api-client';
import { can, canSeeDashboard, isManagementUser } from '@marutham/lib';

// Matches the router basename (Vite's base without its trailing slash): '/app' on
// the web, '' in a native Capacitor build served from the webview root.
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/+$/, '');

/** A capability requirement for a nav item / route. */
export type NavRequirement =
  | { module: string; action?: string } // default action: 'view'
  | { dashboard: 'executive' | 'operations' | 'adminhead' | 'hub' };

/** Does the user satisfy a requirement? */
export function meetsRequirement(user: User | null | undefined, req?: NavRequirement): boolean {
  if (!req) return isManagementUser(user); // no requirement = any management user
  if ('dashboard' in req) return canSeeDashboard(user, req.dashboard);
  return can(user, req.module, req.action || 'view');
}

/** Where a user may read a record's audit trail + login history. */
export function canSeeAudit(user: User | null | undefined): boolean {
  return can(user, 'audit_logs', 'view');
}

/* Landing route per canonical role. Replaces the old homesOn* helpers: the server
 * hands us role_key, so the home is a single lookup. Board lands on the executive
 * dashboard; the operational tiers on operations; Hub Incharge on the hub floor;
 * Technical Head / HR on the Head-Office control panel; Admin on the generic
 * Overview (they run every section and reach the specialist dashboards from the
 * sidebar). VCO / Delivery Agent live in the separate /agent app. */
const HOME_BY_ROLE_KEY: Record<string, string> = {
  board_of_directors: '/admin/executive',
  state_head: '/admin/operations',
  zonal_manager: '/admin/operations',
  regional_manager: '/admin/operations',
  district_manager: '/admin/operations',
  hub_manager: '/admin/hub-dashboard',
  hub_incharge: '/admin/hub',
  technical_head: '/admin/adminhead',
  hr: '/admin/adminhead',
  admin: '/admin',
};

/** Admin-console landing path for a management user (null if not one). */
export function adminHome(user: User | null | undefined): string | null {
  if (!user?.role_key) return null;
  return HOME_BY_ROLE_KEY[user.role_key] || '/admin';
}

export interface AdminNavItem {
  id: string;
  labelKey: string;
  icon: string;
  to: string;
  /** Capability needed to see this item. Omitted = any management user. */
  requires?: NavRequirement;
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
      // The generic business Overview — any management user.
      { id: 'overview', labelKey: 'admin.nav.overview', icon: '📊', to: '/admin' },
      {
        id: 'executive',
        labelKey: 'admin.nav.executive',
        icon: '🏛️',
        to: '/admin/executive',
        requires: { dashboard: 'executive' },
      },
      {
        id: 'operations',
        labelKey: 'admin.nav.operations',
        icon: '🚚',
        to: '/admin/operations',
        requires: { dashboard: 'operations' },
      },
      {
        id: 'adminhead',
        labelKey: 'admin.nav.adminhead',
        icon: '🏢',
        to: '/admin/adminhead',
        requires: { dashboard: 'adminhead' },
      },
      {
        id: 'orders',
        labelKey: 'admin.nav.orders',
        icon: '📦',
        to: '/admin/orders',
        requires: { module: 'orders' },
      },
      {
        id: 'hub-dashboard',
        labelKey: 'admin.nav.hubDashboard',
        icon: '📈',
        to: '/admin/hub-dashboard',
        requires: { dashboard: 'hub' },
      },
      {
        id: 'hub',
        labelKey: 'admin.nav.hub',
        icon: '🏭',
        to: '/admin/hub',
        requires: { module: 'warehouse_hub', action: 'edit' },
      },
      {
        id: 'hubs',
        labelKey: 'admin.nav.hubs',
        icon: '🗺️',
        to: '/admin/hubs',
        requires: { module: 'hub_management', action: 'view' },
      },
      {
        id: 'returns',
        labelKey: 'admin.nav.returns',
        icon: '↩️',
        to: '/admin/returns',
        requires: { module: 'returns_refunds' },
      },
      {
        id: 'payouts',
        labelKey: 'admin.nav.payouts',
        icon: '💸',
        to: '/admin/payouts',
        requires: { module: 'settlement_sellers' },
      },
      {
        id: 'users',
        labelKey: 'admin.nav.users',
        icon: '👥',
        to: '/admin/users',
        requires: { module: 'user_management' },
      },
      {
        id: 'roles',
        labelKey: 'admin.nav.roles',
        icon: '🔐',
        to: '/admin/roles',
        requires: { module: 'role_permission_management' },
      },
    ],
  },
  {
    id: 'approvals',
    labelKey: 'admin.nav.approvals',
    items: [
      {
        id: 'registrations',
        labelKey: 'admin.nav.registrations',
        icon: '📋',
        to: '/admin/registrations',
        requires: { module: 'seller_management', action: 'edit' },
      },
      {
        id: 'listings',
        labelKey: 'admin.nav.listings',
        icon: '🌾',
        to: '/admin/listings',
        requires: { module: 'product_approval', action: 'approve' },
      },
      {
        id: 'change-requests',
        labelKey: 'admin.nav.changeRequests',
        icon: '📝',
        to: '/admin/change-requests',
        requires: { module: 'seller_management', action: 'approve' },
      },
    ],
  },
  {
    id: 'people',
    labelKey: 'admin.nav.people',
    items: [
      {
        id: 'employees',
        labelKey: 'admin.nav.employees',
        icon: '🧑‍💼',
        to: '/admin/employees',
        requires: { module: 'employee_management' },
      },
    ],
  },
  {
    id: 'catalog',
    labelKey: 'admin.nav.catalog',
    items: [
      {
        id: 'products',
        labelKey: 'admin.nav.products',
        icon: '🌾',
        to: '/admin/products',
        requires: { module: 'product_approval', action: 'edit' },
      },
    ],
  },
];

/** Drop the sections/items the user's permissions do not grant. */
export function filterAdminNav(
  sections: AdminNavSection[],
  user: User | null | undefined,
): AdminNavSection[] {
  return sections
    .map((s) => ({ ...s, items: s.items.filter((i) => meetsRequirement(user, i.requires)) }))
    .filter((s) => s.items.length > 0);
}
