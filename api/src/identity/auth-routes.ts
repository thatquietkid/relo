import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseJsonBody } from '../shared/validation.js';
import { ApiError } from '../shared/errors.js';
import { makeAuthService, type AuthService, type DemoPortal } from './auth-service.js';
import { makeInvitationService, type InvitationService } from './invitation-service.js';
import { createSupabasePortFromEnv, type SupabasePort } from './supabase.js';

export interface AuthRouteDependencies {
  authService?: AuthService;
  invitationService?: InvitationService;
  createSupabasePort?: (accessToken?: string) => SupabasePort;
  frontendOrigin?: string;
  demoAccessEnabled?: boolean;
}

function bearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function requireBearerToken(request: FastifyRequest): string {
  const token = bearerToken(request);
  if (!token) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return token;
}

function authService(deps: AuthRouteDependencies, accessToken?: string): AuthService {
  if (deps.authService) return deps.authService;
  const factory = deps.createSupabasePort ?? createSupabasePortFromEnv;
  return makeAuthService({
    supabase: factory(accessToken),
    frontendOrigin: deps.frontendOrigin,
  });
}

function invitationService(deps: AuthRouteDependencies, accessToken: string): InvitationService {
  if (deps.invitationService) return deps.invitationService;
  const factory = deps.createSupabasePort ?? createSupabasePortFromEnv;
  return makeInvitationService({ supabase: factory(accessToken) });
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthRouteDependencies = {}): void {
  app.post('/api/v1/auth/otp/request', async (request) => {
    const input = parseJsonBody(z.object({ email: z.string().email() }), request.body);
    return authService(deps).requestEmailOtp(input.email);
  });

  if (deps.demoAccessEnabled === true) {
    app.post('/api/v1/auth/demo', async (request) => {
      if (!deps.frontendOrigin || request.headers.origin !== deps.frontendOrigin) {
        throw new ApiError(403, 'DEMO_ORIGIN_NOT_ALLOWED', 'Demo access is available only from the configured development app.');
      }
      const input = parseJsonBody(z.object({ portal: z.enum(['employee', 'hr', 'admin']) }), request.body);
      const service = authService(deps);
      if (!service.signInDemo) {
        throw new ApiError(503, 'DEMO_ACCESS_NOT_CONFIGURED', 'Demo access is not configured for this environment.');
      }
      return service.signInDemo(input.portal as DemoPortal);
    });
  }

  app.post('/api/v1/auth/otp/verify', async (request) => {
    const input = parseJsonBody(z.object({ email: z.string().email(), token: z.string().regex(/^\d{6}$/) }), request.body);
    return authService(deps).verifyEmailOtp(input.email, input.token);
  });

  app.get('/api/v1/auth/google/start', async (request) => {
    const redirectTo = typeof request.query === 'object' && request.query !== null
      ? String((request.query as { redirect_to?: unknown }).redirect_to ?? '')
      : '';
    return { url: await authService(deps).getGoogleSignInUrl(redirectTo) };
  });

  app.get('/api/v1/auth/me', async (request) => {
    const token = requireBearerToken(request);
    return authService(deps, token).getCurrentIdentity(token);
  });

  app.post('/api/v1/auth/logout', async (request) => {
    const token = requireBearerToken(request);
    return authService(deps, token).logout(token);
  });

  app.post('/api/v1/invitations/:token/accept', async (request) => {
    const accessToken = requireBearerToken(request);
    const token = String((request.params as { token?: string }).token ?? '');
    const identity = await authService(deps, accessToken).getCurrentIdentity(accessToken);
    const membership = await invitationService(deps, accessToken).acceptInvitation(identity.user.id, token);
    return { membership };
  });
}
