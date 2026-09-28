import type { FastifyRequest } from 'fastify';
import { createSupabasePortFromEnv, type SupabasePort } from '../identity/supabase.js';
import { makeAuthService, type AuthService } from '../identity/auth-service.js';
import type { IdentityContext } from '../identity/types.js';
import type { MembershipView } from '../tenancy/types.js';
import { ApiError } from '../shared/errors.js';
import {
  assertMembershipActive,
  assertTenantAccess,
  permissionsFor,
  type AuthorizationContext,
} from './policy.js';

export interface AuthorizationDependencies {
  authService?: AuthService;
  createSupabasePort?: (accessToken?: string) => SupabasePort;
  loadMemberships?: (userId: string, accessToken: string) => Promise<MembershipView[]>;
}

export type RequireAuth = (request: FastifyRequest) => Promise<IdentityContext>;

function bearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function authenticationRequired(): ApiError {
  return new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
}

function resolveAuthService(deps: AuthorizationDependencies, accessToken: string): AuthService {
  if (deps.authService) return deps.authService;
  const factory = deps.createSupabasePort ?? createSupabasePortFromEnv;
  return makeAuthService({ supabase: factory(accessToken) });
}

async function resolveMemberships(
  deps: AuthorizationDependencies,
  identity: IdentityContext,
  accessToken: string,
): Promise<MembershipView[]> {
  if (deps.loadMemberships) return deps.loadMemberships(identity.user.id, accessToken);
  if (deps.authService && !deps.createSupabasePort) return identity.memberships;

  const factory = deps.createSupabasePort ?? createSupabasePortFromEnv;
  const port = factory(accessToken);
  if (port.getMemberships) return port.getMemberships(identity.user.id);
  return identity.memberships;
}

function tenantHeader(request: FastifyRequest): string | null {
  const value = request.headers['x-tenant-id'];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function selectMembership(identity: IdentityContext, requestedTenantId: string | null): MembershipView {
  if (requestedTenantId) {
    assertTenantAccess(identity, requestedTenantId);
    return identity.memberships.find((membership) => membership.tenant_id === requestedTenantId)!;
  }

  const activeMemberships = identity.memberships.filter(
    (membership) => membership.status === 'active' && membership.tenant.status === 'active',
  );
  if (activeMemberships.length > 1) {
    throw new ApiError(400, 'TENANT_SELECTION_REQUIRED', 'Select a tenant before continuing.');
  }
  if (activeMemberships.length === 1) return activeMemberships[0];

  const suspended = identity.memberships.find((membership) => membership.status === 'suspended');
  if (suspended) {
    assertMembershipActive(suspended);
  }
  const revoked = identity.memberships.find((membership) => membership.status === 'revoked');
  if (revoked) {
    assertMembershipActive(revoked);
  }
  throw new ApiError(403, 'MEMBERSHIP_REQUIRED', 'An active tenant membership is required.');
}

export function makeAuthorizationHooks(deps: AuthorizationDependencies = {}): { requireAuth: RequireAuth } {
  const requireAuth: RequireAuth = async (request) => {
    const accessToken = bearerToken(request);
    if (!accessToken) throw authenticationRequired();

    let identity: IdentityContext;
    try {
      identity = await resolveAuthService(deps, accessToken).getCurrentIdentity(accessToken);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw authenticationRequired();
    }

    let memberships: MembershipView[];
    try {
      memberships = await resolveMemberships(deps, identity, accessToken);
    } catch {
      throw new ApiError(503, 'MEMBERSHIP_LOOKUP_FAILED', 'Unable to resolve tenant membership.');
    }

    const resolvedIdentity: IdentityContext = { ...identity, memberships };
    const membership = selectMembership(resolvedIdentity, tenantHeader(request));
    const context: AuthorizationContext = {
      identity: resolvedIdentity,
      tenantId: membership.tenant_id,
      membership,
      permissions: permissionsFor(resolvedIdentity, membership),
    };
    request.relo = context;
    return resolvedIdentity;
  };

  return { requireAuth };
}

export async function requireAuth(
  request: FastifyRequest,
  deps: AuthorizationDependencies = {},
): Promise<IdentityContext> {
  return makeAuthorizationHooks(deps).requireAuth(request);
}
