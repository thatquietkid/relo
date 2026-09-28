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
import { loadConfig, type ApiConfig } from './shared/config.js';
import './authorization/policy.js';

export interface AppDependencies extends AuthRouteDependencies, OAuthRouteDependencies, EmployeeRouteDependencies {}

export function createApp(
  options: FastifyServerOptions = {},
  dependencies: AppDependencies = {},
  config: ApiConfig = loadConfig(),
): FastifyInstance {
  const resolvedDependencies: AppDependencies = {
    ...dependencies,
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

  app.setNotFoundHandler((request, reply) => {
    const error = new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
    return sendError(reply, error);
  });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  return app;
}
