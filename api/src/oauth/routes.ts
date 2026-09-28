import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthService, type AuthService } from '../identity/auth-service.js';
import { createSupabasePortFromEnv, type SupabasePort } from '../identity/supabase.js';
import { parseJsonBody } from '../shared/validation.js';
import { ApiError } from '../shared/errors.js';
import { makeConsentService, type ConsentService } from './consent-service.js';

export interface OAuthRouteDependencies {
  authService?: AuthService;
  consentService?: ConsentService;
  createSupabasePort?: (accessToken?: string) => SupabasePort;
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

function services(deps: OAuthRouteDependencies, accessToken: string): { auth: AuthService; consent: ConsentService } {
  if (deps.authService && deps.consentService) return { auth: deps.authService, consent: deps.consentService };
  const factory = deps.createSupabasePort ?? createSupabasePortFromEnv;
  const supabase = factory(accessToken);
  return {
    auth: deps.authService ?? makeAuthService({ supabase }),
    consent: deps.consentService ?? makeConsentService({ supabase }),
  };
}

export function registerOAuthRoutes(app: FastifyInstance, deps: OAuthRouteDependencies = {}): void {
  app.get('/api/v1/oauth/authorization-details', async (request) => {
    const token = requireBearerToken(request);
    const authorizationId = typeof request.query === 'object' && request.query !== null
      ? String((request.query as { authorization_id?: unknown }).authorization_id ?? '')
      : '';
    const current = services(deps, token);
    const identity = await current.auth.getCurrentIdentity(token);
    return { authorization: await current.consent.getAuthorizationDetails(identity, authorizationId) };
  });

  app.post('/api/v1/oauth/approve', async (request) => {
    const token = requireBearerToken(request);
    const input = parseJsonBody(z.object({ authorizationId: z.string().min(1) }), request.body);
    const current = services(deps, token);
    const identity = await current.auth.getCurrentIdentity(token);
    return current.consent.approveAuthorization(identity, input.authorizationId);
  });

  app.post('/api/v1/oauth/deny', async (request) => {
    const token = requireBearerToken(request);
    const input = parseJsonBody(z.object({ authorizationId: z.string().min(1) }), request.body);
    const current = services(deps, token);
    const identity = await current.auth.getCurrentIdentity(token);
    return current.consent.denyAuthorization(identity, input.authorizationId);
  });
}
