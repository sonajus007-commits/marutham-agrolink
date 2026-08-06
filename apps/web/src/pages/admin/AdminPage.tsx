import { type MouseEvent } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppShell,
  Header,
  Sidebar,
  IconButton,
  LangToggle,
  EmptyState,
  type SidebarSection,
} from '@marutham/ui';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider } from '../../components/Toast';
import { ADMIN_NAV, APP_BASE, filterAdminNav } from './adminNav';
import { AdminGeoProvider } from './AdminGeoContext';
import { OverviewPage } from './OverviewPage';
import { ExecutivePage } from './ExecutivePage';
import { OperationsPage } from './OperationsPage';
import { AdminHeadPage } from './AdminHeadPage';
import { OrdersPage } from './OrdersPage';
import { ReturnsPage } from './ReturnsPage';
import { PayoutsPage } from './PayoutsPage';
import { UsersPage } from './UsersPage';
import { RolesPage } from './RolesPage';
import { RegistrationsPage } from './RegistrationsPage';
import { ListingsPage } from './ListingsPage';
import { ChangeRequestsPage } from './ChangeRequestsPage';
import { ProductsPage } from './ProductsPage';
import { EmployeesPage } from './EmployeesPage';
import { ProfilePage } from './ProfilePage';
import { HubQueuePage } from './HubQueuePage';

/**
 * The Admin / management console. Wires the Phase-3 shell (AppShell + Sidebar +
 * Header) to react-router: the sidebar carries real hrefs (so middle-click opens
 * a tab and the active highlight works) but intercepts plain left-clicks to
 * navigate within the SPA, keeping the shell — and the ~1MB chart bundle — mounted.
 */
export function AdminPage() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (!user) return null;

  // useLocation is basename-relative; the sidebar matches on the full /app path.
  const currentPath = APP_BASE + location.pathname;

  const go = (to: string) => (e: MouseEvent<HTMLElement>) => {
    // Let the browser handle new-tab / new-window intents on the real anchor.
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return;
    e.preventDefault();
    navigate(to);
  };

  const sections: SidebarSection[] = filterAdminNav(ADMIN_NAV, user).map((section) => ({
    id: section.id,
    label: section.labelKey ? t(section.labelKey) : undefined,
    items: section.items.map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      icon: item.icon,
      href: APP_BASE + item.to,
      onClick: go(item.to),
    })),
  }));

  const brand = (
    <a
      href={`${APP_BASE}/admin`}
      onClick={go('/admin')}
      className="flex items-center gap-2 no-underline"
    >
      <img src="/img/logo-sm.jpg" alt="" className="h-7 w-7 shrink-0 rounded-sm" />
      <span className="text-md font-bold leading-tight text-primary">Marutham AgroLink</span>
    </a>
  );

  const sidebar = (
    <Sidebar
      sections={sections}
      currentPath={currentPath}
      brand={<div className="px-1">{brand}</div>}
      footer={
        <a
          href={`${APP_BASE}/admin/profile`}
          onClick={go('/admin/profile')}
          className="block min-w-0 no-underline"
        >
          <div className="truncate text-sm font-semibold text-fg">
            {user.fname || user.login_id}
          </div>
          <div className="truncate text-2xs text-fg-muted">{user.admin_role || 'Admin'}</div>
        </a>
      }
    />
  );

  const actions = (
    <>
      <LangToggle
        value={i18n.language}
        onChange={(v) => changeLanguage(v as AppLanguage)}
        options={[
          { value: 'en', label: 'EN' },
          { value: 'ta', label: 'த', className: 'tamil' },
        ]}
      />
      <IconButton onClick={() => navigate('/admin/profile')} aria-label={t('admin.profile.title')}>
        👤
      </IconButton>
      <IconButton onClick={logout} aria-label={t('nav.logout')}>
        ⎋
      </IconButton>
    </>
  );

  return (
    <ToastProvider>
      <AdminGeoProvider>
        <AppShell
          currentPath={currentPath}
          sidebar={sidebar}
          header={({ openNav }) => <Header onMenuClick={openNav} brand={brand} actions={actions} />}
        >
          <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6">
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="executive" element={<ExecutivePage />} />
              <Route path="operations" element={<OperationsPage />} />
              <Route path="adminhead" element={<AdminHeadPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="returns" element={<ReturnsPage />} />
              <Route path="payouts" element={<PayoutsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="roles" element={<RolesPage />} />
              <Route path="registrations" element={<RegistrationsPage />} />
              <Route path="listings" element={<ListingsPage />} />
              <Route path="change-requests" element={<ChangeRequestsPage />} />
              <Route path="products" element={<ProductsPage />} />
              <Route path="employees" element={<EmployeesPage />} />
              <Route path="hub" element={<HubQueuePage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<Placeholder titleKey="admin.nav.overview" />} />
            </Routes>
          </div>
        </AppShell>
      </AdminGeoProvider>
    </ToastProvider>
  );
}

/** A not-yet-built section — the console shell is real, the page is a stub. */
function Placeholder({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation();
  return (
    <>
      <h1 className="mb-4 text-xl font-bold text-primary">{t(titleKey)}</h1>
      <EmptyState icon="🚧">{t('admin.comingSoon')}</EmptyState>
    </>
  );
}
