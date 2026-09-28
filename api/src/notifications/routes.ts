import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { ApiError } from '../shared/errors.js';
import { parseJsonBody } from '../shared/validation.js';
import type { IdentityContext } from '../identity/types.js';
import { createSupabaseNotificationRepositoryFromEnv } from './supabase-repository.js';
import { makeNotificationService, type NotificationRepository } from './notification-service.js';

export interface NotificationRouteDependencies extends AuthorizationDependencies {
  notificationRepository?: NotificationRepository;
  createNotificationRepository?: (accessToken: string) => NotificationRepository;
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

function repositoryForRequest(deps: NotificationRouteDependencies, request: FastifyRequest): NotificationRepository {
  if (deps.notificationRepository) return deps.notificationRepository;
  try { return (deps.createNotificationRepository ?? createSupabaseNotificationRepositoryFromEnv)(bearerToken(request)); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(503, 'NOTIFICATION_DATA_UNAVAILABLE', 'Notification data is unavailable.');
  }
}

function notificationId(request: FastifyRequest): string {
  const value = (request.params as { id?: unknown }).id;
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'The notification ID is required.');
  return value;
}

const querySchema = z.object({ page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().positive().default(20) });
const preferencesSchema = z.object({
  timezone: z.string().trim().max(80).optional(), email: z.boolean().optional(), inApp: z.boolean().optional(), push: z.boolean().optional(), shareContact: z.boolean().optional(),
  channels: z.object({ email: z.boolean().optional(), inApp: z.boolean().optional(), push: z.boolean().optional() }).optional(),
  privacy: z.object({ shareContact: z.boolean().optional() }).optional(),
});

export function registerNotificationRoutes(app: FastifyInstance, deps: NotificationRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort });

  app.get('/api/v1/me/notifications', { preHandler: hooks.requireAuth }, async (request) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'The notification query is invalid.');
    const repository = repositoryForRequest(deps, request);
    return makeNotificationService({ repository }).listNotifications(identityForRequest(request), parsed.data);
  });

  app.post('/api/v1/me/notifications/:id/read', { preHandler: hooks.requireAuth }, async (request, reply) => {
    const repository = repositoryForRequest(deps, request);
    await makeNotificationService({ repository }).markNotificationRead(identityForRequest(request), notificationId(request));
    return reply.code(204).send();
  });

  app.get('/api/v1/me/preferences', { preHandler: hooks.requireAuth }, async (request) => {
    const repository = repositoryForRequest(deps, request);
    return { preferences: await makeNotificationService({ repository }).getPreferences(identityForRequest(request)) };
  });

  app.patch('/api/v1/me/preferences', { preHandler: hooks.requireAuth }, async (request) => {
    const input = parseJsonBody(preferencesSchema, request.body);
    const repository = repositoryForRequest(deps, request);
    return { preferences: await makeNotificationService({ repository }).updatePreferences(identityForRequest(request), input) };
  });
}
