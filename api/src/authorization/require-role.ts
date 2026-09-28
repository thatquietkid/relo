import type { preHandlerHookHandler } from 'fastify';
import { ApiError } from '../shared/errors.js';
import { hasRole } from './policy.js';

export type RoutePreHandler = preHandlerHookHandler;

export function requireRole(...roles: string[]): RoutePreHandler {
  return async (request) => {
    if (!request.relo) {
      throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
    }
    const requestsPlatformScope = roles.some((role) => ['admin', 'platform_admin'].includes(role));
    const hasPlatformScope = request.relo.identity.platformScope === true;
    if ((requestsPlatformScope && !hasPlatformScope) || !hasRole(request.relo.membership, roles)) {
      throw new ApiError(403, 'ROLE_REQUIRED', 'The required role is not assigned.');
    }
  };
}
