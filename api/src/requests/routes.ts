import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { ApiError } from '../shared/errors.js';
import { parseIdempotencyKey, parseJsonBody } from '../shared/validation.js';
import type { IdentityContext } from '../identity/types.js';
import { createSupabaseProviderRequestRepositoryFromEnv } from './supabase-repository.js';
import { makeRequestService, type ProviderRequestRepository } from './request-service.js';

export interface ProviderRequestRouteDependencies extends AuthorizationDependencies {
  providerRequestRepository?: ProviderRequestRepository;
  createProviderRequestRepository?: (accessToken: string) => ProviderRequestRepository;
}

function identityForRequest(request: FastifyRequest): IdentityContext {
  const context = request.relo;
  if (!context) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return context.membership ? { ...context.identity, memberships: [context.membership] } : context.identity;
}

function bearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function repositoryForRequest(deps: ProviderRequestRouteDependencies, request: FastifyRequest): ProviderRequestRepository {
  if (deps.providerRequestRepository) return deps.providerRequestRepository;
  try { return (deps.createProviderRequestRepository ?? createSupabaseProviderRequestRepositoryFromEnv)(bearerToken(request)); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'EMPLOYEE_DATA_UNAVAILABLE', 'Employee relocation data is unavailable.');
  }
}

function requestId(request: FastifyRequest): string {
  const value = (request.params as { id?: unknown }).id;
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'The provider request ID is required.');
  return value;
}

const entryBody = z.object({ entryId: z.string().trim().min(1).max(120) });
const consentBody = entryBody.extend({
  consents: z.array(z.object({ field: z.string().trim().min(1).max(80), consented: z.boolean() })).min(1).max(10),
});

export function registerProviderRequestRoutes(app: FastifyInstance, deps: ProviderRequestRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort });

  app.post('/api/v1/me/provider-requests/preview', { preHandler: hooks.requireAuth }, async (request) => {
    const input = parseJsonBody(entryBody, request.body);
    const repository = repositoryForRequest(deps, request);
    return { preview: await makeRequestService({ repository }).previewRequest(identityForRequest(request), input.entryId) };
  });

  app.post('/api/v1/me/provider-requests', { preHandler: hooks.requireAuth }, async (request) => {
    const input = parseJsonBody(consentBody, request.body);
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const repository = repositoryForRequest(deps, request);
    return { request: await makeRequestService({ repository }).submitRequest(identityForRequest(request), input, idempotencyKey, request.id) };
  });

  app.get('/api/v1/me/provider-requests', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    return { requests: await makeRequestService({ repository }).listRequests(identityForRequest(request)) };
  });

  app.post('/api/v1/me/provider-requests/:id/withdraw', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    return { request: await makeRequestService({ repository }).withdrawRequest(identityForRequest(request), requestId(request), request.id) };
  });
}
