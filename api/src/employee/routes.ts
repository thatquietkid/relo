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

export interface EmployeeRouteDependencies extends AuthorizationDependencies {
  employeeRepository?: EmployeeRepository;
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

function repositoryOrUnavailable(deps: EmployeeRouteDependencies): EmployeeRepository {
  if (deps.employeeRepository) return deps.employeeRepository;
  throw new ApiError(503, 'EMPLOYEE_DATA_UNAVAILABLE', 'Employee relocation data is unavailable.');
}

export function registerEmployeeRoutes(app: FastifyInstance, deps: EmployeeRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({
    authService: deps.authService,
    createSupabasePort: deps.createSupabasePort,
  });

  app.get('/api/v1/me/relocation', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryOrUnavailable(deps);
    const service = makeCaseService({ repository });
    return { relocation: await service.getMyRelocationCase(identityForRequest(request)) };
  });

  app.get('/api/v1/me/relocation/checklist', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryOrUnavailable(deps);
    const identity = identityForRequest(request);
    const caseService = makeCaseService({ repository });
    const checklistService = makeChecklistService({ repository });
    const relocation = await caseService.getMyRelocationCase(identity);
    return { checklist: await checklistService.listChecklist(identity, relocation.id) };
  });

  app.patch('/api/v1/me/relocation/checklist/:itemId', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryOrUnavailable(deps);
    const input = parseJsonBody(z.object({ state: z.enum(CHECKLIST_STATES) }), request.body);
    const idempotencyKey = parseIdempotencyKey(request.headers['idempotency-key']);
    const identity = identityForRequest(request);
    const caseService = makeCaseService({ repository });
    const checklistService = makeChecklistService({ repository });
    const relocation = await caseService.getMyRelocationCase(identity);
    const item = await checklistService.setChecklistState(
      identity,
      relocation.id,
      itemId(request),
      input.state,
      idempotencyKey,
    );
    return { checklist_item: item };
  });
}
