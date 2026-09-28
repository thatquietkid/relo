import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { ApiError } from '../shared/errors.js';
import { parseIdempotencyKey, parseJsonBody } from '../shared/validation.js';
import type { IdentityContext } from '../identity/types.js';
import { makeCaseService } from './case-service.js';
import {
  CHECKLIST_STATES,
  makeChecklistService,
  type EmployeeRepository,
} from './checklist-service.js';
import { createSupabaseEmployeeRepositoryFromEnv } from './supabase-repository.js';

export interface EmployeeRouteDependencies extends AuthorizationDependencies {
  employeeRepository?: EmployeeRepository;
  createEmployeeRepository?: (accessToken: string) => EmployeeRepository;
}

function identityForRequest(request: FastifyRequest): IdentityContext {
  const context = request.relo;
  if (!context) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return context.membership
    ? { ...context.identity, memberships: [context.membership] }
    : context.identity;
}

function itemId(request: FastifyRequest): string {
  const value = (request.params as { itemId?: unknown }).itemId;
  if (typeof value !== 'string' || !value.trim()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The checklist item ID is required.');
  }
  return value;
}

function bearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function repositoryForRequest(deps: EmployeeRouteDependencies, request: FastifyRequest): EmployeeRepository {
  if (deps.employeeRepository) return deps.employeeRepository;
  const token = bearerToken(request);
  const factory = deps.createEmployeeRepository ?? createSupabaseEmployeeRepositoryFromEnv;
  try {
    return factory(token);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'EMPLOYEE_DATA_UNAVAILABLE', 'Employee relocation data is unavailable.');
  }
}

export function registerEmployeeRoutes(app: FastifyInstance, deps: EmployeeRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({
    authService: deps.authService,
    createSupabasePort: deps.createSupabasePort,
  });

  app.get('/api/v1/me/relocation', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    const service = makeCaseService({ repository });
    return { relocation: await service.getMyRelocationCase(identityForRequest(request), request.id) };
  });

  app.get('/api/v1/me/relocation/checklist', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    const identity = identityForRequest(request);
    const caseService = makeCaseService({ repository });
    const checklistService = makeChecklistService({ repository });
    const relocation = await caseService.getMyRelocationCase(identity, request.id);
    return { checklist: await checklistService.listChecklist(identity, relocation.id) };
  });

  app.patch('/api/v1/me/relocation/checklist/:itemId', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    const input = parseJsonBody(z.object({ state: z.enum(CHECKLIST_STATES) }), request.body);
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const identity = identityForRequest(request);
    const caseService = makeCaseService({ repository });
    const checklistService = makeChecklistService({ repository });
    const relocation = await caseService.getMyRelocationCase(identity, request.id);
    const item = await checklistService.setChecklistState(
      identity,
      relocation.id,
      itemId(request),
      input.state,
      idempotencyKey,
      request.id,
    );
    return { checklist_item: item };
  });
}
