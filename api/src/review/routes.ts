import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { IdentityContext } from '../identity/types.js';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { requireRole } from '../authorization/require-role.js';
import { ApiError } from '../shared/errors.js';
import { parseJsonBody } from '../shared/validation.js';
import { createSupabaseReviewRepositoryFromEnv } from './supabase-repository.js';
import { makeContentReviewService, type ReviewRepository, type ReviewStatus, type ReviewerSettingsPatch } from './content-service.js';

export interface ReviewRouteDependencies extends AuthorizationDependencies { reviewRepository?: ReviewRepository; createReviewRepository?: (accessToken: string) => ReviewRepository; }
function identityForRequest(request: FastifyRequest): IdentityContext { const context = request.relo; if (!context) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.'); return context.membership ? { ...context.identity, memberships: [context.membership] } : context.identity; }
function bearerToken(request: FastifyRequest): string { const value = request.headers.authorization; return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : ''; }
function repositoryForRequest(deps: ReviewRouteDependencies, request: FastifyRequest): ReviewRepository { if (deps.reviewRepository) return deps.reviewRepository; try { return (deps.createReviewRepository ?? createSupabaseReviewRepositoryFromEnv)(bearerToken(request)); } catch { throw new ApiError(503, 'REVIEW_DATA_UNAVAILABLE', 'Review data is unavailable.'); } }
function resourceId(request: FastifyRequest): string { const value = (request.params as { id?: unknown }).id; if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'The resource ID is required.'); return value; }
const status = z.enum(['draft', 'published', 'archived']);
const queue = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().max(100).default(20), status: status.optional() });
const draft = z.object({ providerId: z.string().trim().min(1), cityId: z.string().trim().min(1), category: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(240), description: z.string().trim().min(1).max(4000), sourceUrl: z.string().url().nullable().optional(), expiresAt: z.string().datetime().nullable().optional() });
const patch = draft.partial();
const unpublish = z.object({ reason: z.string().trim().min(1).max(500) });
const settings = z.object({ cityIds: z.array(z.string().trim().min(1)).optional(), categories: z.array(z.string().trim().min(1)).optional(), timezone: z.string().trim().min(1).max(80).optional(), channels: z.object({ email: z.boolean().optional(), inApp: z.boolean().optional() }).optional() });

export function registerReviewRoutes(app: FastifyInstance, deps: ReviewRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort });
  const role = requireRole('reviewer', 'admin');
  app.get('/api/v1/review/queue', { preHandler: [hooks.requireAuth, role] }, async (request) => { const input = queue.safeParse(request.query); if (!input.success) throw new ApiError(400, 'VALIDATION_ERROR', 'The review queue query is invalid.'); return makeContentReviewService({ repository: repositoryForRequest(deps, request) }).listReviewQueue(identityForRequest(request), input.data as { page: number; pageSize: number; status?: ReviewStatus }); });
  app.post('/api/v1/review/directory', { preHandler: [hooks.requireAuth, role] }, async (request, reply) => { const input = parseJsonBody(draft, request.body); const entry = await makeContentReviewService({ repository: repositoryForRequest(deps, request) }).saveDraft(identityForRequest(request), input); return reply.code(201).send({ entry }); });
  app.patch('/api/v1/review/directory/:id', { preHandler: [hooks.requireAuth, role] }, async (request) => { const input = parseJsonBody(patch, request.body); const entry = await makeContentReviewService({ repository: repositoryForRequest(deps, request) }).updateDraft(identityForRequest(request), resourceId(request), input); return { entry }; });
  app.post('/api/v1/review/directory/:id/publish', { preHandler: [hooks.requireAuth, role] }, async (request) => { const entry = await makeContentReviewService({ repository: repositoryForRequest(deps, request) }).publishEntry(identityForRequest(request), resourceId(request)); return { entry }; });
  app.post('/api/v1/review/directory/:id/unpublish', { preHandler: [hooks.requireAuth, role] }, async (request) => { const input = parseJsonBody(unpublish, request.body); const entry = await makeContentReviewService({ repository: repositoryForRequest(deps, request) }).unpublishEntry(identityForRequest(request), resourceId(request), input.reason); return { entry }; });
  app.get('/api/v1/review/settings', { preHandler: [hooks.requireAuth, role] }, async (request) => ({ settings: await makeContentReviewService({ repository: repositoryForRequest(deps, request) }).getReviewerSettings(identityForRequest(request)) }));
  app.patch('/api/v1/review/settings', { preHandler: [hooks.requireAuth, role] }, async (request) => { const input = parseJsonBody(settings, request.body); const patch: ReviewerSettingsPatch = input; return { settings: await makeContentReviewService({ repository: repositoryForRequest(deps, request) }).updateReviewerSettings(identityForRequest(request), patch) }; });
}
