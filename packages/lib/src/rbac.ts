/* Frontend permission helpers — the client mirror of backend/middleware/
 * permissions.js. The backend is authoritative (it 403s regardless), but the UI
 * uses these to hide what a user cannot do so it never offers a door that only
 * fails. Both read the SAME permission map the server ships on GET /auth/me, so
 * there is a single source of truth and nothing to drift.
 */

export interface PermUser {
  permissions?: Record<string, { actions: string[]; scope: string }> | null;
  dashboards?: {
    executive?: boolean;
    operations?: boolean;
    adminhead?: boolean;
    hub?: boolean;
  } | null;
  role_key?: string | null;
}

/** True if the user may perform `action` on `module`. */
export function can(user: PermUser | null | undefined, module: string, action: string): boolean {
  const p = user?.permissions?.[module];
  return !!p && p.actions.includes(action);
}

/** True if the user has ANY permission on the module (i.e. can at least see it). */
export function canAccessModule(user: PermUser | null | undefined, module: string): boolean {
  const p = user?.permissions?.[module];
  return !!p && p.actions.length > 0;
}

/** The user's data scope for a module ('none' if not granted). */
export function scopeFor(user: PermUser | null | undefined, module: string): string {
  return user?.permissions?.[module]?.scope || 'none';
}

/** Whether a composite dashboard is open to this user (server-computed flags). */
export function canSeeDashboard(
  user: PermUser | null | undefined,
  which: 'executive' | 'operations' | 'adminhead' | 'hub',
): boolean {
  return !!user?.dashboards?.[which];
}

/** Any management surface at all — the door to the /admin console. */
export function isManagementUser(user: PermUser | null | undefined): boolean {
  return !!user?.role_key && !!user?.permissions && Object.keys(user.permissions).length > 0;
}
