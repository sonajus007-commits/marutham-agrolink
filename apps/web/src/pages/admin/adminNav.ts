/* Navigation model for the Admin / management console. Kept as plain data so it
 * stays declarative and testable: AdminPage turns it into <Sidebar> sections,
 * role-filtering with filterNavByRole and wiring each item for SPA navigation.
 *
 * `to` is the router path (no basename); the sidebar href is APP_BASE + to so a
 * real anchor / middle-click still resolves under the /app mount. */

export const APP_BASE = '/app';

/** admin_role values that use THIS console. Delivery Agent + VCO have /agent. */
export const MANAGEMENT_ADMIN_ROLES = [
  'Head Office', 'State Head', 'Regional Manager', 'District Manager',
  'Hub Incharge', 'Board of Director',
] as const;

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
      { id: 'orders', labelKey: 'admin.nav.orders', icon: '📦', to: '/admin/orders' },
      { id: 'returns', labelKey: 'admin.nav.returns', icon: '↩️', to: '/admin/returns' },
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
    id: 'catalog',
    labelKey: 'admin.nav.catalog',
    items: [
      { id: 'products', labelKey: 'admin.nav.products', icon: '🌾', to: '/admin/products' },
    ],
  },
];
