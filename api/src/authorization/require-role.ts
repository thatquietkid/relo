import type { preHandlerHookHandler } from 'fastify';
import { ApiError } from '../shared/errors.js';
import { hasRole } from './policy.js';

export type RoutePreHandler = preHandlerHookHandler;

export function requireRole(...roles: string[]): RoutePreHandler {
  return async (request) => {
    if (!request.relo) {
      throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    }
    const platformRoleRequested = roles.includes('platform_admin');
    const tenantRoles = roles.filter((role) => role !== 'platform_admin');
    const hasPlatformRole = request.relo.identity.platformScope === true
      && request.relo.identity.platformRoles?.includes('platform_admin') === true;
    const hasTenantRole = request.relo.membership !== null && hasRole(request.relo.membership, tenantRoles);
    if (!((platformRoleRequested && hasPlatformRole) || (tenantRoles.length > 0 && hasTenantRole))) {
      throw new ApiError(403, 'ROLE_REQUIRED', 'The required role is not assigned.');
    }
  };
}
