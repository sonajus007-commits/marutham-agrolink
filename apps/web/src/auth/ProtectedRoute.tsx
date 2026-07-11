import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { User, UserRole } from '@marutham/api-client';
import { useAuth } from './AuthContext';

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
  if (user.role === 'admin') return '/admin';
  return '/dashboard';
}
