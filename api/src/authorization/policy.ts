import type { FastifyRequest } from 'fastify';
import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from '../identity/types.js';
import type { MembershipView } from '../tenancy/types.js';

export const PERMISSIONS = {
  EMPLOYEE_READ: 'employee:read',
  EMPLOYEE_WRITE: 'employee:write',
  PROFILE_READ: 'profile:read',
  PROFILE_WRITE: 'profile:write',
  CHECKLIST_READ: 'checklist:read',
  CHECKLIST_WRITE: 'checklist:write',
  DIRECTORY_READ: 'directory:read',
  SHORTLIST_WRITE: 'shortlist:write',
  REQUESTS_WRITE: 'requests:write',
  HR_READ: 'hr:read',
  HR_WRITE: 'hr:write',
  PROGRAMS_READ: 'programs:read',
  PROGRAMS_WRITE: 'programs:write',
  INVITATIONS_READ: 'invitations:read',
  INVITATIONS_WRITE: 'invitations:write',
  REPORTS_READ: 'reports:read',
  TENANT_ADMIN_READ: 'tenant-admin:read',
  TENANT_ADMIN_WRITE: 'tenant-admin:write',
  REVIEWER_READ: 'reviewer:read',
  REVIEWER_WRITE: 'reviewer:write',
  CONTENT_READ: 'content:read',
  CONTENT_WRITE: 'content:write',
  CONTENT_PUBLISH: 'content:publish',
  PLATFORM_TENANTS_MANAGE: 'platform:tenants:manage',
  PLATFORM_ROLES_MANAGE: 'platform:roles:manage',
  PLATFORM_SECURITY_MANAGE: 'platform:security:manage',
  PLATFORM_AUDIT_READ: 'platform:audit:read',
  PLATFORM_HEALTH_READ: 'platform:health:read',
  PLATFORM_FEATURE_FLAGS_MANAGE: 'platform:feature-flags:manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

const EMPLOYEE_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.EMPLOYEE_READ,
  PERMISSIONS.EMPLOYEE_WRITE,
  PERMISSIONS.PROFILE_READ,
  PERMISSIONS.PROFILE_WRITE,
  PERMISSIONS.CHECKLIST_READ,
  PERMISSIONS.CHECKLIST_WRITE,
  PERMISSIONS.DIRECTORY_READ,
  PERMISSIONS.SHORTLIST_WRITE,
  PERMISSIONS.REQUESTS_WRITE,
];

const HR_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.HR_READ,
  PERMISSIONS.HR_WRITE,
  PERMISSIONS.PROGRAMS_READ,
  PERMISSIONS.PROGRAMS_WRITE,
  PERMISSIONS.INVITATIONS_READ,
  PERMISSIONS.INVITATIONS_WRITE,
  PERMISSIONS.REPORTS_READ,
];

const TENANT_ADMIN_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.TENANT_ADMIN_READ,
  PERMISSIONS.TENANT_ADMIN_WRITE,
];

const REVIEWER_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.REVIEWER_READ,
  PERMISSIONS.REVIEWER_WRITE,
  PERMISSIONS.CONTENT_READ,
  PERMISSIONS.CONTENT_WRITE,
  PERMISSIONS.CONTENT_PUBLISH,
];

const PLATFORM_ADMIN_PERMISSIONS: readonly Permission[] = [
  PERMISSIONS.PLATFORM_TENANTS_MANAGE,
  PERMISSIONS.PLATFORM_ROLES_MANAGE,
  PERMISSIONS.PLATFORM_SECURITY_MANAGE,
  PERMISSIONS.PLATFORM_AUDIT_READ,
  PERMISSIONS.PLATFORM_HEALTH_READ,
  PERMISSIONS.PLATFORM_FEATURE_FLAGS_MANAGE,
];

const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  employee: EMPLOYEE_PERMISSIONS,
  hr: HR_PERMISSIONS,
  admin: TENANT_ADMIN_PERMISSIONS,
  reviewer: REVIEWER_PERMISSIONS,
};

function membershipError(membership: MembershipView): ApiError | null {
  if (membership.status === 'suspended') {
    return new ApiError(403, 'MEMBERSHIP_SUSPENDED', 'The membership is suspended.');
  }
  if (membership.status === 'revoked') {
    return new ApiError(403, 'MEMBERSHIP_REVOKED', 'The membership is revoked.');
  }
  if (membership.tenant.status !== 'active') {
    return new ApiError(403, 'TENANT_ACCESS_DENIED', 'The selected tenant is not active.');
  }
  return null;
}

export function assertTenantAccess(identity: IdentityContext, tenantId: string): void {
  const membership = identity.memberships.find((candidate) => candidate.tenant_id === tenantId);
  if (!membership) {
    throw new ApiError(403, 'TENANT_ACCESS_DENIED', 'The user does not belong to the requested tenant.');
  }
  const error = membershipError(membership);
  if (error) throw error;
}

export function permissionsFor(identity: IdentityContext, membership: MembershipView | null): Permission[] {
  const permissions = new Set<Permission>();
  if (membership) {
    for (const role of membership.roles) {
      const rolePermissions = ROLE_PERMISSIONS[role.key];
      if (rolePermissions) rolePermissions.forEach((permission) => permissions.add(permission));
    }
  }
  if (identity.platformScope === true && identity.platformRoles?.includes('platform_admin')) {
    PLATFORM_ADMIN_PERMISSIONS.forEach((permission) => permissions.add(permission));
  }
  return [...permissions];
}

export function can(context: AuthorizationContext, permission: string): boolean;
export function can(identity: IdentityContext, permission: string, tenantId?: string): boolean;
export function can(
  identityOrContext: IdentityContext | AuthorizationContext,
  permission: string,
  tenantId?: string,
): boolean {
  if (!(Object.values(PERMISSIONS) as string[]).includes(permission)) return false;
  if ('identity' in identityOrContext) {
    return identityOrContext.permissions.includes(permission as Permission);
  }
  if (!tenantId) return false;
  const membership = identityOrContext.memberships.find((candidate) => candidate.tenant_id === tenantId);
  if (!membership || membership.status !== 'active' || membership.tenant.status !== 'active') return false;
  return permissionsFor(identityOrContext, membership).includes(permission as Permission);
}

export interface AuthorizationContext {
  identity: IdentityContext;
  tenantId: string | null;
  membership: MembershipView | null;
  permissions: Permission[];
}

declare module 'fastify' {
  interface FastifyRequest {
    relo: AuthorizationContext | null;
  }
}

export function assertMembershipActive(membership: MembershipView): void {
  const error = membershipError(membership);
  if (error) throw error;
}

export function hasRole(membership: MembershipView, roles: readonly string[]): boolean {
  const allowed = new Set(roles);
  return membership.roles.some((role) => allowed.has(role.key));
}

export type AuthorizationRequest = FastifyRequest;
