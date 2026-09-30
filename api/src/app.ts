import sensible from '@fastify/sensible';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { ApiError } from './shared/errors.js';
import { MAX_BODY_SIZE, sendError } from './shared/http.js';
import { registerAuthRoutes, type AuthRouteDependencies } from './identity/auth-routes.js';
import { registerOAuthRoutes, type OAuthRouteDependencies } from './oauth/routes.js';
import { registerEmployeeRoutes, type EmployeeRouteDependencies } from './employee/routes.js';
import { createSupabaseEmployeeRepositoryFromEnv } from './employee/supabase-repository.js';
import { registerDirectoryRoutes, type DirectoryRouteDependencies } from './directory/routes.js';
import { registerProviderRequestRoutes, type ProviderRequestRouteDependencies } from './requests/routes.js';
import { registerNotificationRoutes, type NotificationRouteDependencies } from './notifications/routes.js';
import { registerHrRoutes, type HrRouteDependencies } from './hr/routes.js';
import { registerReviewRoutes, type ReviewRouteDependencies } from './review/routes.js';
import { registerReportingRoutes, type ReportingRouteDependencies } from './reporting/routes.js';
import { registerAdminRoutes, type AdminRouteDependencies } from './admin/routes.js';
import { registerProfileRoutes, type ProfileRouteDependencies } from './profile/routes.js';
import { loadConfig, type ApiConfig } from './shared/config.js';
import './authorization/policy.js';
import { allowedOrigin, securityHeaders } from './security/cors.js';

export interface AppDependencies extends AuthRouteDependencies, OAuthRouteDependencies, EmployeeRouteDependencies, DirectoryRouteDependencies, ProviderRequestRouteDependencies, NotificationRouteDependencies, HrRouteDependencies, ReviewRouteDependencies, ReportingRouteDependencies, AdminRouteDependencies, ProfileRouteDependencies {}

export function createApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
  config: ApiConfig = loadConfig(),
): FastifyInstance {
  const resolvedDependencies: AppDependencies = {
    ...dependencies,
    frontendOrigin: dependencies.frontendOrigin ?? config.frontendOrigin,
    demoAccessEnabled: config.demoAccessEnabled,
    createEmployeeRepository: dependencies.createEmployeeRepository ?? createSupabaseEmployeeRepositoryFromEnv,
  };
  const app = Fastify({
    ...options,
    bodyLimit: Math.min(options.bodyLimit ?? MAX_BODY_SIZE, MAX_BODY_SIZE),
    requestIdHeader: 'x-request-id',
  });

  app.register(sensible);
  app.decorateRequest('relo', null);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
    const headers = securityHeaders({ ...process.env, FRONTEND_ORIGIN: config.frontendOrigin, SUPABASE_URL: config.supabaseUrl });
    for (const [key, value] of Object.entries(headers)) reply.header(key, value);
    const origin = request.headers.origin;
    if (origin && !allowedOrigin(origin, { ...process.env, FRONTEND_ORIGIN: config.frontendOrigin, SUPABASE_URL: config.supabaseUrl })) {
      return reply.code(403).send({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'The request origin is not allowed.', requestId: request.id } });
    }
    if (origin) reply.header('Access-Control-Allow-Origin', origin);
    if (request.method === 'OPTIONS') {
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, X-Tenant-Id');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      return reply.code(204).send();
    }
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_request, reply) => {
    if (config.readiness.supabase !== 'configured') {
      return reply.code(503).send({
        status: 'not_ready',
        checks: config.readiness,
      });
    }

    return {
      status: 'ready',
      checks: config.readiness,
    };
  });

  registerAuthRoutes(app, resolvedDependencies);
  registerOAuthRoutes(app, resolvedDependencies);
  registerEmployeeRoutes(app, resolvedDependencies);
  registerDirectoryRoutes(app, resolvedDependencies);
  registerProviderRequestRoutes(app, resolvedDependencies);
  registerNotificationRoutes(app, resolvedDependencies);
  registerHrRoutes(app, resolvedDependencies);
  registerReviewRoutes(app, resolvedDependencies);
  registerReportingRoutes(app, resolvedDependencies);
  registerAdminRoutes(app, resolvedDependencies);
  registerProfileRoutes(app, resolvedDependencies);

  app.setNotFoundHandler((request, reply) => {
    const error = new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
    return sendError(reply, error);
  });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  return app;
}
