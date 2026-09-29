import type { DemoPortal, WebIdentity } from './auth-client';

export type WorkspaceRole = DemoPortal | 'reviewer' | 'platform_admin';

export function workspaceRoleForIdentity(identity: WebIdentity): WorkspaceRole {
  if (identity.platformAuthorization?.scope === 'platform'
    && identity.platformAuthorization.roles.includes('platform_admin')) return 'platform_admin';
  const role = identity.memberships[0]?.roles[0]?.key;
  return role === 'hr' || role === 'admin' || role === 'reviewer' ? role : 'employee';
}

export function workspaceHomePath(role: WorkspaceRole): string {
  if (role === 'hr') return '/hr';
  if (role === 'admin') return '/admin';
  if (role === 'reviewer') return '/review';
  if (role === 'platform_admin') return '/admin/tenants';
  return '/';
}

export function returnPathForWorkspace(path: string | null, role: WorkspaceRole): string | null {
  if (!path?.startsWith('/') || path.startsWith('//')) return null;
  if (role === 'hr') return path === '/hr' || path.startsWith('/hr/') ? path : null;
  if (role === 'admin') {
    const adminPath = path === '/admin' || path.startsWith('/admin/users');
    return adminPath ? path : null;
  }
  if (role === 'reviewer') return path === '/review' || path.startsWith('/review/') ? path : null;
  if (role === 'platform_admin') {
    return ['/admin/tenants', '/admin/health', '/admin/settings'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
      ? path
      : null;
  }
  return ['/hr', '/admin', '/review'].some((prefix) => path === prefix || path.startsWith(`${prefix}/`)) ? null : path;
}
