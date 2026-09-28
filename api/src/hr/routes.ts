import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { requireRole } from '../authorization/require-role.js';
import { ApiError } from '../shared/errors.js';
import { parseIdempotencyKey, parseJsonBody } from '../shared/validation.js';
import type { IdentityContext } from '../identity/types.js';
import { createSupabaseHrRepositoryFromEnv } from './supabase-repository.js';
import { makeHrService, type HrRepository } from './invitation-service.js';

export interface HrRouteDependencies extends AuthorizationDependencies {
  hrRepository?: HrRepository;
  createHrRepository?: (accessToken: string) => HrRepository;
  frontendOrigin?: string;
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

function repositoryForRequest(deps: HrRouteDependencies, request: FastifyRequest): HrRepository {
  if (deps.hrRepository) return deps.hrRepository;
  try { return (deps.createHrRepository ?? createSupabaseHrRepositoryFromEnv)(bearerToken(request)); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'HR_DATA_UNAVAILABLE', 'HR data is unavailable.');
  }
}

function invitationId(request: FastifyRequest): string {
  const value = (request.params as { id?: unknown }).id;
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'The invitation ID is required.');
  return value;
}

const employeeQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().max(100).optional(),
});
const invitationInput = z.object({ email: z.string().email(), name: z.string().trim().max(200).optional(), role: z.string().optional() });

export function registerHrRoutes(app: FastifyInstance, deps: HrRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort });
  const role = requireRole('hr', 'admin');

  app.get('/api/v1/hr/employees', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const parsed = employeeQuery.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'The employee query is invalid.');
    const repository = repositoryForRequest(deps, request);
    return makeHrService({ repository, frontendOrigin: deps.frontendOrigin }).listTenantEmployees(identityForRequest(request), parsed.data);
  });

  app.post('/api/v1/hr/invitations', { preHandler: [hooks.requireAuth, role] }, async (request, reply) => {
    const input = parseJsonBody(invitationInput, request.body);
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const repository = repositoryForRequest(deps, request);
    const invitation = await makeHrService({ repository, frontendOrigin: deps.frontendOrigin }).createEmployeeInvitation(identityForRequest(request), input, idempotencyKey);
    return reply.code(201).send({ invitation });
  });

  app.post('/api/v1/hr/invitations/:id/resend', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const repository = repositoryForRequest(deps, request);
    const invitation = await makeHrService({ repository, frontendOrigin: deps.frontendOrigin }).resendEmployeeInvitation(identityForRequest(request), invitationId(request), idempotencyKey);
    return { invitation };
  });

  app.post('/api/v1/hr/invitations/:id/revoke', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    const invitation = await makeHrService({ repository, frontendOrigin: deps.frontendOrigin }).revokeEmployeeInvitation(identityForRequest(request), invitationId(request));
    return { invitation };
  });
}
