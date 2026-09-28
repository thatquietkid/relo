import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';

const rolePermissions: Record<string, string[]> = {
  employee: ['employee:read', 'employee:write'],
  hr: ['employee:read', 'hr:read', 'hr:write'],
  reviewer: ['employee:read', 'reviewer:read', 'reviewer:write'],
  admin: ['employee:read', 'hr:read', 'reviewer:read', 'admin:read', 'admin:write'],
  platform_admin: ['employee:read', 'hr:read', 'reviewer:read', 'admin:read', 'admin:write'],
};

function can(identity: ReturnType<typeof useAuth>['identity'], permission: string): boolean {
  if (!identity) return false;
  return identity.memberships.some((membership) => membership.status === 'active'
    && membership.roles.some((role) => rolePermissions[role.key]?.includes(permission)));
}

export function ProtectedRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const auth = useAuth();

  useEffect(() => {
    if (auth.status === 'unauthenticated' && window.location.pathname !== '/login') {
      sessionStorage.setItem('relo.returnTo', `${window.location.pathname}${window.location.search}`);
      window.history.replaceState({}, '', '/login');
    }
  }, [auth.status]);

  if (auth.status === 'loading') {
    return <div className="route-state" role="status">Checking your session</div>;
  }
  if (auth.status === 'unauthenticated') {
    return <div className="route-state"><h1>Sign in to continue</h1><p>Your Relo workspace is protected.</p><Link className="button button-dark" to="/login">Sign in</Link></div>;
  }
  if (!can(auth.identity, permission)) {
    return <div className="route-state"><h1>Access not available</h1><p>Your current Relo membership does not include this workspace.</p></div>;
  }
  return <>{children}</>;
}
