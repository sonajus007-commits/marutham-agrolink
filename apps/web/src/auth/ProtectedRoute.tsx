import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { User, UserRole } from '@marutham/api-client';
import { can, canSeeDashboard, isManagementUser } from '@marutham/lib';
import { useAuth } from './AuthContext';
import { adminHome } from '../pages/admin/adminNav';

/* Route guard mirroring the backend RBAC. A route can require:
 *   • a top-level role (consumer / farmer / admin), and/or
 *   • `management` — any management role (the door to /admin/*), and/or
 *   • a specific `permission` (module + action), and/or
 *   • a composite `dashboard` flag.
 * The server enforces the same rules and 403s regardless; this just keeps a user
 * from landing on a page that can only fail. */
export function ProtectedRoute({
  children,
  role,
  roleKeys,
  management,
  permission,
  dashboard,
}: {
  children: ReactNode;
  role?: UserRole;
  roleKeys?: string[];
  management?: boolean;
  permission?: { module: string; action?: string };
  dashboard?: 'executive' | 'operations' | 'adminhead';
}) {
  const { user, loading } = useAuth();

  if (loading) return <div className="centered">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to="/login" replace />;
  if (roleKeys && !roleKeys.includes(String(user.role_key)))
    return <Navigate to="/login" replace />;
  if (management && !isManagementUser(user)) return <Navigate to="/login" replace />;
  if (permission && !can(user, permission.module, permission.action || 'view')) {
    return <Navigate to="/login" replace />;
  }
  if (dashboard && !canSeeDashboard(user, dashboard)) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/** Where a user lands after login / at "/". */
export function roleHome(user: User): string {
  // VCO + Delivery Agent work in the separate field app.
  if (user.role === 'admin' && (user.role_key === 'vco' || user.role_key === 'delivery_agent')) {
    return '/agent';
  }
  if (user.role === 'consumer') return '/consumer';
  if (user.role === 'farmer') return '/farmer';
  // Management roles land on their role's home dashboard (see adminHome).
  const home = adminHome(user);
  if (home) return home;
  if (user.role === 'admin') return '/admin';
  return '/dashboard';
}
