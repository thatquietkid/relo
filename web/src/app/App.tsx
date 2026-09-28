import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AppShell, PublicPage } from './routes';
import { ProtectedRoute } from '../components/ProtectedRoute';

const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const AuthCallbackPage = lazy(() => import('../pages/auth/AuthCallbackPage'));
const InviteAcceptPage = lazy(() => import('../pages/auth/InviteAcceptPage'));
const OAuthConsentPage = lazy(() => import('../pages/oauth/OAuthConsentPage'));

function RouteLoading() { return <div className="route-state" role="status">Loading Relo</div>; }

export const protectedRouteMetadata = [
  { prefix: '/hr', permission: 'hr:read' },
  { prefix: '/review', permission: 'reviewer:read' },
  { prefix: '/admin/health', permission: 'platform:health:read' },
  { prefix: '/admin/tenants', permission: 'platform:tenants:manage' },
  { prefix: '/admin/settings', permission: 'platform:feature-flags:manage' },
  { prefix: '/admin/users', permission: 'tenant-admin:write' },
  { prefix: '/admin', permission: 'tenant-admin:read' },
] as const;

export function permissionForPath(pathname: string): string {
  const route = protectedRouteMetadata.find(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return route?.permission || 'employee:read';
}

function ProtectedWorkspace() {
  const location = useLocation();
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    if (path !== location.pathname) setPath(location.pathname);
  }, [location.pathname, path]);
  const permission = permissionForPath(path);
  return <ProtectedRoute permission={permission}><AppShell><div className="page-content"><div className="page-heading"><p className="eyebrow">Protected workspace</p><h1>{path === '/' ? 'Your relocation workspace.' : path.slice(1).replaceAll('/', ' · ')}</h1><p>This route is ready for its domain module. Access is guarded by your active Relo membership.</p></div><section className="panel"><h2>Next step</h2><p>Protected data requests begin only after the auth boundary has resolved.</p></section></div></AppShell></ProtectedRoute>;
}

function AppRoutes() {
  return <Suspense fallback={<RouteLoading />}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/auth/callback" element={<AuthCallbackPage />} /><Route path="/invite/:token" element={<InviteAcceptPage />} /><Route path="/oauth/consent" element={<OAuthConsentPage />} /><Route path="/privacy" element={<PublicPage kind="privacy" />} /><Route path="/terms" element={<PublicPage kind="terms" />} /><Route path="/status" element={<PublicPage kind="status" />} /><Route path="*" element={<ProtectedWorkspace />} /></Routes></Suspense>;
}

export function App() { return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>; }

export default App;
