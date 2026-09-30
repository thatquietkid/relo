import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../app/auth/AuthProvider';

import { ForbiddenPage } from '../pages/errors/ForbiddenPage';

const rolePermissions: Record<string, string[]> = {
  employee: ['employee:read', 'employee:write', 'profile:read', 'profile:write', 'checklist:read', 'checklist:write', 'directory:read', 'shortlist:write', 'requests:write'],
  hr: ['hr:read', 'hr:write', 'programs:read', 'programs:write', 'invitations:read', 'invitations:write', 'reports:read'],
  reviewer: ['reviewer:read', 'reviewer:write', 'content:read', 'content:write', 'content:publish'],
  admin: ['tenant-admin:read', 'tenant-admin:write'],
};
const platformPermissions = ['platform:tenants:manage', 'platform:roles:manage', 'platform:security:manage', 'platform:audit:read', 'platform:health:read', 'platform:feature-flags:manage'];

function can(identity: ReturnType<typeof useAuth>['identity'], permission: string): boolean {
  if (!identity) return false;
  if (identity.platformAuthorization?.scope === 'platform'
    && identity.platformAuthorization.roles.includes('platform_admin')
    && identity.platformAuthorization.permissions.includes(permission)
    && platformPermissions.includes(permission)) return true;
  return identity.memberships.some((membership) => membership.status === 'active'
    && membership.roles.some((role) => rolePermissions[role.key]?.includes(permission)));
}

export function ProtectedRoute({ permission, children }: { permission: string; children: ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return <div className="route-state" role="status">Checking your session</div>;
  }
  if (auth.status === 'unauthenticated') {
    if (sessionStorage.getItem('relo.signingOut') === 'true') {
      return <Navigate to="/login" replace />;
    }
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  if (!can(auth.identity, permission)) {
    return <ForbiddenPage requiredPermission={permission} />;
  }
  return <>{children}</>;
}
