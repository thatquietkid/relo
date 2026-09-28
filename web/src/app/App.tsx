import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './auth/AuthProvider';
import { AppShell, PublicPage } from './routes';
import { ProtectedRoute } from '../components/ProtectedRoute';

const LoginPage = lazy(() => import('../pages/auth/LoginPage'));
const InviteAcceptPage = lazy(() => import('../pages/auth/InviteAcceptPage'));
const OAuthConsentPage = lazy(() => import('../pages/oauth/OAuthConsentPage'));

function RouteLoading() { return <div className="route-state" role="status">Loading Relo</div>; }

function ProtectedWorkspace() {
  const location = useLocation();
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    if (path !== location.pathname) setPath(location.pathname);
  }, [location.pathname, path]);
  return <ProtectedRoute permission={path.startsWith('/hr') ? 'hr:read' : path.startsWith('/review') ? 'reviewer:read' : path.startsWith('/admin') ? 'admin:read' : 'employee:read'}><AppShell><div className="page-content"><div className="page-heading"><p className="eyebrow">Protected workspace</p><h1>{path === '/' ? 'Your relocation workspace.' : path.slice(1).replaceAll('/', ' · ')}</h1><p>This route is ready for its domain module. Access is guarded by your active Relo membership.</p></div><section className="panel"><h2>Next step</h2><p>Protected data requests begin only after the auth boundary has resolved.</p></section></div></AppShell></ProtectedRoute>;
}

function AppRoutes() {
  return <Suspense fallback={<RouteLoading />}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/invite/:token" element={<InviteAcceptPage />} /><Route path="/oauth/consent" element={<OAuthConsentPage />} /><Route path="/privacy" element={<PublicPage kind="privacy" />} /><Route path="/terms" element={<PublicPage kind="terms" />} /><Route path="/status" element={<PublicPage kind="status" />} /><Route path="*" element={<ProtectedWorkspace />} /></Routes></Suspense>;
}

export function App() { return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>; }

export default App;
