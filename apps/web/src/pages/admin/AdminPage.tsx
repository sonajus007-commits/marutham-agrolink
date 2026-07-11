import { type MouseEvent } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AppShell, Header, Sidebar, IconButton, LangToggle, EmptyState,
  type SidebarSection,
} from '@marutham/ui';
import { filterNavByRole } from '@marutham/lib';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { useAuth } from '../../auth/AuthContext';
import { ToastProvider } from '../../components/Toast';
import { ADMIN_NAV, APP_BASE } from './adminNav';
import { OverviewPage } from './OverviewPage';
import { OrdersPage } from './OrdersPage';
import { UsersPage } from './UsersPage';

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
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };

  const sections: SidebarSection[] = ADMIN_NAV.map((section) => ({
    id: section.id,
    label: section.labelKey ? t(section.labelKey) : undefined,
    items: filterNavByRole(section.items, user.admin_role).map((item) => ({
      id: item.id,
      label: t(item.labelKey),
      icon: item.icon,
      href: APP_BASE + item.to,
      onClick: go(item.to),
    })),
  })).filter((s) => s.items.length > 0);

  const brand = (
    <a href={`${APP_BASE}/admin`} onClick={go('/admin')} className="flex items-center gap-2">
      <img src="/img/logo-sm.jpg" alt="" className="h-7 w-7 rounded-sm" />
      <span className="text-md font-bold text-primary">Marutham</span>
    </a>
  );

  const sidebar = (
    <Sidebar
      sections={sections}
      currentPath={currentPath}
      brand={<div className="px-1">{brand}</div>}
      footer={
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-fg">{user.fname || user.login_id}</div>
          <div className="truncate text-2xs text-fg-muted">{user.admin_role || 'Admin'}</div>
        </div>
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
      <IconButton onClick={logout} aria-label={t('nav.logout')}>⎋</IconButton>
    </>
  );

  return (
    <ToastProvider>
    <AppShell
      currentPath={currentPath}
      sidebar={sidebar}
      header={({ openNav }) => <Header onMenuClick={openNav} brand={brand} actions={actions} />}
    >
      <div className="mx-auto w-full max-w-[1100px] p-4 sm:p-6">
        <Routes>
          <Route index element={<OverviewPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="registrations" element={<Placeholder titleKey="admin.nav.registrations" />} />
          <Route path="change-requests" element={<Placeholder titleKey="admin.nav.changeRequests" />} />
          <Route path="products" element={<Placeholder titleKey="admin.nav.products" />} />
          <Route path="*" element={<Placeholder titleKey="admin.nav.overview" />} />
        </Routes>
      </div>
    </AppShell>
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
