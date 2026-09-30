import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { AppShell, PublicPage, resolvedRole } from './routes';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Error pages
import { NotFoundPage } from '../pages/errors/NotFoundPage';
import { ForbiddenPage } from '../pages/errors/ForbiddenPage';
import { ServerErrorPage } from '../pages/errors/ServerErrorPage';

// Employee pages
import { EmployeeHomePage } from '../pages/employee/EmployeeHomePage';
import { ChecklistPage } from '../pages/employee/ChecklistPage';
import { ExplorePage } from '../pages/employee/ExplorePage';
import { SavedPage } from '../pages/employee/SavedPage';
import { RequestsPage } from '../pages/employee/RequestsPage';
import { ProfilePage } from '../pages/employee/ProfilePage';
import { ProfileEditPage } from '../pages/employee/ProfileEditPage';
import { SettingsPage } from '../pages/employee/SettingsPage';

// HR pages
import { HrDashboardPage } from '../pages/hr/HrDashboardPage';
import { EmployeesPage } from '../pages/hr/EmployeesPage';
import { PropertiesPage } from '../pages/hr/PropertiesPage';
import { CohortsPage } from '../pages/hr/CohortsPage';
import { ProgramsPage } from '../pages/hr/ProgramsPage';
import { HrRequestsPage } from '../pages/hr/RequestsPage';
import { ReportsPage } from '../pages/hr/ReportsPage';
import { HrSettingsPage } from '../pages/hr/HrSettingsPage';

// Reviewer pages
import { ReviewQueuePage } from '../pages/review/ReviewQueuePage';
import { ContentPage } from '../pages/review/ContentPage';
import { ReviewerSettingsPage } from '../pages/review/ReviewerSettingsPage';

// Admin pages
import { AdminEventsPage } from '../pages/admin/AdminEventsPage';
import { AdminUsersPage } from '../pages/admin/AdminUsersPage';
import { AdminSecurityPage } from '../pages/admin/AdminSecurityPage';
import { AdminSettingsPage } from '../pages/admin/AdminSettingsPage';

const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const AuthCallbackPage = lazy(() => import('../pages/auth/AuthCallbackPage'));
const InviteAcceptPage = lazy(() => import('../pages/auth/InviteAcceptPage'));
const OAuthConsentPage = lazy(() => import('../pages/oauth/OAuthConsentPage'));

function RouteLoading() {
  return <div className="route-state" role="status">Loading Relo</div>;
}

export const protectedRouteMetadata = [
  { prefix: '/hr', permission: 'hr:read' },
  { prefix: '/review', permission: 'reviewer:read' },
  { prefix: '/admin/security', permission: 'platform:security:manage' },
  { prefix: '/admin/health', permission: 'platform:health:read' },
  { prefix: '/admin/tenants', permission: 'platform:tenants:manage' },
  { prefix: '/admin/settings', permission: 'platform:feature-flags:manage' },
  { prefix: '/admin/users', permission: 'tenant-admin:write' },
  { prefix: '/admin', permission: 'tenant-admin:read' },
] as const;

export function permissionForPath(pathname: string): string {
  const route = protectedRouteMetadata.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return route?.permission || 'employee:read';
}

function ProtectedWorkspace() {
  const location = useLocation();
  const { identity } = useAuth();
  const [path, setPath] = useState(location.pathname);

  useEffect(() => {
    if (path !== location.pathname) setPath(location.pathname);
  }, [location.pathname, path]);

  const permission = permissionForPath(path);
  const employee = resolvedRole(identity) === 'employee';

  const employeePage =
    path === '/' ? <EmployeeHomePage /> :
    path === '/checklist' ? <ChecklistPage /> :
    path === '/explore' ? <ExplorePage /> :
    path === '/saved' ? <SavedPage /> :
    path === '/requests' ? <RequestsPage /> :
    path === '/profile' ? <ProfilePage /> :
    path === '/profile/edit' ? <ProfileEditPage /> :
    path === '/settings' ? <SettingsPage /> :
    null;

  const operationsPage =
    path === '/hr' ? <HrDashboardPage /> :
    path === '/hr/employees' ? <EmployeesPage /> :
    path === '/hr/properties' ? <PropertiesPage /> :
    path === '/hr/cohorts' ? <CohortsPage /> :
    path === '/hr/programs' ? <ProgramsPage /> :
    path === '/hr/requests' ? <HrRequestsPage /> :
    path === '/hr/reports' ? <ReportsPage /> :
    path === '/hr/settings' ? <HrSettingsPage /> :
    path === '/review' ? <ReviewQueuePage /> :
    path === '/review/directory' ? <ContentPage /> :
    path === '/review/settings' ? <ReviewerSettingsPage /> :
    path === '/admin' ? <AdminEventsPage /> :
    path === '/admin/users' ? <AdminUsersPage /> :
    path === '/admin/security' ? <AdminSecurityPage /> :
    path === '/admin/settings' ? <AdminSettingsPage /> :
    null;

  const currentPage = employee && employeePage ? employeePage : operationsPage;

  return (
    <ProtectedRoute permission={permission}>
      <AppShell>
        {currentPage || <NotFoundPage message={`The workspace route "${path}" could not be found.`} />}
      </AppShell>
    </ProtectedRoute>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/oauth/consent" element={<OAuthConsentPage />} />
        <Route path="/privacy" element={<PublicPage kind="privacy" />} />
        <Route path="/terms" element={<PublicPage kind="terms" />} />
        <Route path="/status" element={<PublicPage kind="status" />} />

        {/* Dedicated error routes for testability and deep-linking */}
        <Route path="/404" element={<NotFoundPage />} />
        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="/500" element={<ServerErrorPage />} />

        {/* All application workspace routes */}
        <Route path="*" element={<ProtectedWorkspace />} />
      </Routes>
    </Suspense>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
