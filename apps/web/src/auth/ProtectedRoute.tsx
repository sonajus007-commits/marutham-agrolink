import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { User, UserRole } from '@marutham/api-client';
import { useAuth } from './AuthContext';
import { homesOnExecutive, homesOnOperations, homesOnAdminHead } from '../pages/admin/adminNav';

/* Route guard mirroring backend/middleware/auth.js: requires a session and,
 * optionally, a specific top-level role and/or set of admin_roles. */
export function ProtectedRoute({
  children,
  role,
  adminRoles,
}: {
  children: ReactNode;
  role?: UserRole;
  adminRoles?: string[];
}) {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  if (adminRoles && !adminRoles.includes(String(user.admin_role))) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/** Where a user lands after login / at "/". Grows as more roles migrate. */
export function roleHome(user: User): string {
  if (user.role === 'admin' && ['Delivery Agent', 'VCO'].includes(String(user.admin_role))) {
    return '/agent';
  }
  if (user.role === 'consumer') return '/consumer';
  if (user.role === 'farmer') return '/farmer';
  // The Hub Incharge's whole job is the hub queue; legacy opened them there.
  if (user.role === 'admin' && user.admin_role === 'Hub Incharge') return '/admin/hub';
  // The board's job IS the business overview. Until this line existed, a Board of
  // Director signing in landed on the operational Overview — a dashboard that
  // does not carry the district map, the category split or the financial roll-up
  // they are the audience for. The executive dashboard lived only in legacy
  // admin.html, so migrating the console quietly took it away from them.
  if (user.role === 'admin' && homesOnExecutive(user.admin_role)) return '/admin/executive';
  // Same reasoning one tier down: legacy dispatched a District/Regional/State/Zonal
  // manager's Overview to the operations screen, so that is where they land again.
  if (user.role === 'admin' && homesOnOperations(user.admin_role)) return '/admin/operations';
  // Technical Admin / HR Admin / HR Manager: the Head Office control panel is the
  // ONLY dashboard the backend will serve them, so it is their home rather than a
  // preference. Until they were added to MANAGEMENT_ADMIN_ROLES they had no home
  // at all — signing in bounced them back to /login.
  if (user.role === 'admin' && homesOnAdminHead(user.admin_role)) return '/admin/adminhead';
  if (user.role === 'admin') return '/admin';
  return '/dashboard';
}
