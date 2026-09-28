import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { ApiError } from '../shared/errors.js';
import { parseJsonBody } from '../shared/validation.js';
import type { IdentityContext } from '../identity/types.js';
import { selectEmployeeMembership } from '../employee/checklist-service.js';
import { createSupabaseDirectoryRepositoryFromEnv } from './supabase-repository.js';
import { DIRECTORY_CATEGORIES, type DirectoryRepository } from './types.js';
import { makeDirectoryService } from './directory-service.js';

export interface DirectoryRouteDependencies extends AuthorizationDependencies {
  directoryRepository?: DirectoryRepository;
  createDirectoryRepository?: (accessToken: string) => DirectoryRepository;
}

function identityForRequest(request: FastifyRequest): IdentityContext {
  const context = request.relo;
  if (!context) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return context.membership ? { ...context.identity, memberships: [context.membership] } : context.identity;
}

function repositoryForRequest(deps: DirectoryRouteDependencies, request: FastifyRequest): DirectoryRepository {
  if (deps.directoryRepository) return deps.directoryRepository;
  const token = typeof request.headers.authorization === 'string' && request.headers.authorization.startsWith('Bearer ')
    ? request.headers.authorization.slice(7).trim() : '';
  try { return (deps.createDirectoryRepository ?? createSupabaseDirectoryRepositoryFromEnv)(token); }
  catch { throw new ApiError(503, 'DIRECTORY_DATA_UNAVAILABLE', 'Directory data is unavailable.'); }
}

function paramsEntryId(request: FastifyRequest): string {
  const value = (request.params as { entryId?: unknown }).entryId;
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'The directory entry ID is required.');
  return value;
}

async function assertDestination(request: FastifyRequest, repository: DirectoryRepository, cityId: string): Promise<void> {
  if (!repository.getDestinationCity) return;
  const identity = identityForRequest(request);
  const membership = selectEmployeeMembership(identity);
  const destination = await repository.getDestinationCity(identity.user.id, membership.tenant_id);
  if (!destination) throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  if (destination !== cityId) throw new ApiError(403, 'DIRECTORY_CITY_FORBIDDEN', 'Directory content is limited to your destination.');
}

const querySchema = z.object({
  cityId: z.string().trim().min(1).max(120), category: z.enum(DIRECTORY_CATEGORIES).optional(), query: z.string().optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().default(20),
});

export function registerDirectoryRoutes(app: FastifyInstance, deps: DirectoryRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort });

  app.get('/api/v1/directory', { preHandler: hooks.requireAuth }, async (request) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'The directory query is invalid.');
    const repository = repositoryForRequest(deps, request);
    await assertDestination(request, repository, parsed.data.cityId);
    const service = makeDirectoryService({ repository });
    return service.searchDirectory(parsed.data);
  });

  app.get('/api/v1/directory/:entryId', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    const service = makeDirectoryService({ repository });
    const entry = await service.getDirectoryEntry(paramsEntryId(request));
    await assertDestination(request, repository, entry.cityId);
    return { entry };
  });

  app.get('/api/v1/me/shortlist', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    const service = makeDirectoryService({ repository });
    return { shortlist: await service.listShortlist(identityForRequest(request)) };
  });

  app.post('/api/v1/me/shortlist', { preHandler: hooks.requireAuth }, async (request) => {
    const body = parseJsonBody(z.object({ entryId: z.string().trim().min(1) }), request.body);
    const repository = repositoryForRequest(deps, request);
    const service = makeDirectoryService({ repository });
    const entry = await service.getDirectoryEntry(body.entryId);
    await assertDestination(request, repository, entry.cityId);
    return { shortlist: await service.saveDirectoryEntry(identityForRequest(request), body.entryId, request.id) };
  });

  app.delete('/api/v1/me/shortlist/:entryId', { preHandler: hooks.requireAuth }, async (request, reply) => {
    const service = makeDirectoryService({ repository: repositoryForRequest(deps, request) });
    await service.removeDirectoryEntry(identityForRequest(request), paramsEntryId(request), request.id);
    return reply.code(204).send();
  });
}
