import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { changeLanguage, type AppLanguage } from '@marutham/i18n';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ProtectedRoute, roleHome } from './auth/ProtectedRoute';
import { MANAGEMENT_ADMIN_ROLES } from './pages/admin/adminNav';
import { Login } from './pages/Login';

// Code-split per role so each user only downloads their screen's bundle.
// Keeps ECharts (used only by the proof Dashboard) out of the Agent's load.
const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const AgentPage = lazy(() =>
  import('./pages/agent/AgentPage').then((m) => ({ default: m.AgentPage })),
);
const ConsumerPage = lazy(() =>
  import('./pages/consumer/ConsumerPage').then((m) => ({ default: m.ConsumerPage })),
);
const FarmerPage = lazy(() =>
  import('./pages/farmer/FarmerPage').then((m) => ({ default: m.FarmerPage })),
);
const AdminPage = lazy(() =>
  import('./pages/admin/AdminPage').then((m) => ({ default: m.AdminPage })),
);
const Register = lazy(() => import('./pages/Register').then((m) => ({ default: m.Register })));

function AppBar() {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  if (!user) return null;

  const setLang = (lang: AppLanguage) => changeLanguage(lang);

  return (
    <header className="appbar">
      <span className="appbar__brand">
        Marutham <span>Agrolink</span>
      </span>
      <div className="appbar__right">
        <div className="langtoggle">
          <button className={i18n.language === 'en' ? 'on' : ''} onClick={() => setLang('en')}>
            EN
          </button>
          <button
            className={`tamil ${i18n.language === 'ta' ? 'on' : ''}`}
            onClick={() => setLang('ta')}
          >
            த
          </button>
        </div>
        <button className="langtoggle" onClick={logout}>
          <span style={{ padding: '5px 12px' }}>{t('nav.logout')}</span>
        </button>
      </div>
    </header>
  );
}

/** Redirect "/" to the signed-in user's home screen. */
/* The route-level chunk fallback and the auth check both showed a hardcoded
 * "Loading…" — app chrome, in English, for every role and every language, and the
 * FIRST thing a Tamil user sees while a lazy route compiles. */
function Loading() {
  const { t } = useTranslation();
  return <div className="centered">{t('common.loading', 'Loading…')}</div>;
}

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome(user)} replace />;
}

export function App() {
  return (
    <AuthProvider>
      {/* basename keeps client routing under the /app mount on the web. A native
          Capacitor build sets Vite base to '/', so BASE_URL is '/' and the app
          mounts at the root instead. */}
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, '') || '/'}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<Login />} />
            {/* Sign-up is public and code-split — it never loads for a signed-in user. */}
            <Route path="/register" element={<Register />} />
            <Route path="/" element={<RoleHome />} />

            {/* Agent role (Delivery Agent + VCO) — owns its own mobile chrome */}
            <Route
              path="/agent"
              element={
                <ProtectedRoute role="admin" adminRoles={['Delivery Agent', 'VCO']}>
                  <AgentPage />
                </ProtectedRoute>
              }
            />

            {/* Consumer storefront */}
            <Route
              path="/consumer"
              element={
                <ProtectedRoute role="consumer">
                  <ConsumerPage />
                </ProtectedRoute>
              }
            />

            {/* Farmer / Retailer seller console */}
            <Route
              path="/farmer"
              element={
                <ProtectedRoute role="farmer">
                  <FarmerPage />
                </ProtectedRoute>
              }
            />

            {/* Admin / management console — the tiers above Delivery Agent/VCO */}
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute role="admin" adminRoles={[...MANAGEMENT_ADMIN_ROLES]}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Phase 0 proof dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <>
                    <AppBar />
                    <Dashboard />
                  </>
                </ProtectedRoute>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
