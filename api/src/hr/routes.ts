import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { requireRole } from '../authorization/require-role.js';
import { ApiError } from '../shared/errors.js';
import { parseIdempotencyKey, parseJsonBody } from '../shared/validation.js';
import type { IdentityContext } from '../identity/types.js';
import { createSupabaseHrRepositoryFromEnv } from './supabase-repository.js';
import { makeHrService, type HrRepository } from './invitation-service.js';
import { createSupabaseHrOperationsRepositoryFromEnv, type HrOperationsRepository } from './supabase-operations-repository.js';
import { makeProgramService } from './program-service.js';
import type { ProgramStatus } from '../operations/types.js';
import { makeRequestOperationsService, type RequestOperationsStatus } from './request-operations-service.js';
import { makeHrSettingsService } from './settings-service.js';

export interface HrRouteDependencies extends AuthorizationDependencies {
  hrRepository?: HrRepository;
  createHrRepository?: (accessToken: string) => HrRepository;
  hrOperationsRepository?: HrOperationsRepository;
  createHrOperationsRepository?: (accessToken: string) => HrOperationsRepository;
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

function operationsRepositoryForRequest(deps: HrRouteDependencies, request: FastifyRequest): HrOperationsRepository {
  if (deps.hrOperationsRepository) return deps.hrOperationsRepository;
  try { return (deps.createHrOperationsRepository ?? createSupabaseHrOperationsRepositoryFromEnv)(bearerToken(request)); }
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
const invitationInput = z.object({ email: z.string().email(), name: z.string().trim().max(200).optional(), role: z.enum(['employee', 'hr']).optional() });
const programQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
const programStatuses = z.enum(['draft', 'active', 'paused', 'completed', 'archived']);
const programInput = z.object({
  name: z.string().trim().max(200),
  destinationCityId: z.string().trim().min(1),
  startsAt: z.string(),
  endsAt: z.string(),
  status: programStatuses.optional(),
});
const programPatch = programInput.partial();
const requestStatuses = z.enum(['submitted', 'in_review', 'approved', 'in_progress', 'completed', 'withdrawn', 'rejected']);
const requestQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: requestStatuses.optional(),
});
const requestStatusInput = z.object({ status: requestStatuses });
const settingsPatch = z.object({
  timezone: z.string().trim().max(80).optional(),
  channels: z.object({ email: z.boolean().optional(), inApp: z.boolean().optional() }).optional(),
  defaultProgramStatus: z.enum(['draft', 'active']).optional(),
});

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

  app.get('/api/v1/hr/programs', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const parsed = programQuery.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'The programme query is invalid.');
    const repository = operationsRepositoryForRequest(deps, request);
    return makeProgramService({ repository }).listPrograms(identityForRequest(request), parsed.data);
  });

  app.post('/api/v1/hr/programs', { preHandler: [hooks.requireAuth, role] }, async (request, reply) => {
    const input = parseJsonBody(programInput, request.body);
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const repository = operationsRepositoryForRequest(deps, request);
    const program = await makeProgramService({ repository }).createProgram(identityForRequest(request), input as { name: string; destinationCityId: string; startsAt: string; endsAt: string; status?: ProgramStatus }, idempotencyKey);
    return reply.code(201).send({ program });
  });

  app.patch('/api/v1/hr/programs/:id', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const input = parseJsonBody(programPatch, request.body);
    const repository = operationsRepositoryForRequest(deps, request);
    const program = await makeProgramService({ repository }).updateProgram(identityForRequest(request), invitationId(request), input);
    return { program };
  });

  app.get('/api/v1/hr/provider-requests', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const parsed = requestQuery.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'The provider request query is invalid.');
    const repository = operationsRepositoryForRequest(deps, request);
    return makeRequestOperationsService({ repository }).listTenantRequests(identityForRequest(request), parsed.data as { page: number; pageSize: number; status?: RequestOperationsStatus });
  });

  app.patch('/api/v1/hr/provider-requests/:id', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const input = parseJsonBody(requestStatusInput, request.body);
    const repository = operationsRepositoryForRequest(deps, request);
    const providerRequest = await makeRequestOperationsService({ repository }).updateRequestStatus(identityForRequest(request), invitationId(request), input.status as RequestOperationsStatus);
    return { request: providerRequest };
  });

  app.get('/api/v1/hr/settings', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const repository = operationsRepositoryForRequest(deps, request);
    const settings = await makeHrSettingsService({ repository }).getHrSettings(identityForRequest(request));
    return { settings };
  });

  app.patch('/api/v1/hr/settings', { preHandler: [hooks.requireAuth, role] }, async (request) => {
    const input = parseJsonBody(settingsPatch, request.body);
    const repository = operationsRepositoryForRequest(deps, request);
    const settings = await makeHrSettingsService({ repository }).updateHrSettings(identityForRequest(request), input);
    return { settings };
  });
}
