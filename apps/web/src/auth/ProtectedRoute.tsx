import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@marutham/ui';
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
 * from landing on a page that can only fail.
 *
 * Signed out → the login screen. Signed in but not allowed → a "No access" screen
 * that says so and offers the way back, rather than a silent bounce to login that
 * reads like being logged out. */
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
  const allowed =
    (!role || user.role === role) &&
    (!roleKeys || roleKeys.includes(String(user.role_key))) &&
    (!management || isManagementUser(user)) &&
    (!permission || can(user, permission.module, permission.action || 'view')) &&
    (!dashboard || canSeeDashboard(user, dashboard));
  if (!allowed) return <NoAccess user={user} />;

  return <>{children}</>;
}

/** Signed in, but this page isn't part of the user's role. */
export function NoAccess({ user }: { user: User }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const home = roleHome(user);
  // A home the user can't open either would loop; then only "sign out" helps.
  const canGoHome = home !== pathname;

  return (
    <main className="no-access" role="alert">
      <div className="no-access__icon" aria-hidden="true">
        🔒
      </div>
      <h1 className="no-access__title">{t('state.noAccess.title', 'No access')}</h1>
      <p className="no-access__body">
        {t(
          'state.noAccess.body',
          'Your account doesn’t have permission to open this page. If you need it, ask your administrator.',
        )}
      </p>
      <div className="no-access__actions">
        {canGoHome ? (
          <Button onClick={() => navigate(home, { replace: true })}>
            {t('state.noAccess.home', 'Go to my home')}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={logout}>
          {t('state.noAccess.signOut', 'Sign in as someone else')}
        </Button>
      </div>
    </main>
  );
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
