import sensible from '@fastify/sensible';
import Fastify, {
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { ApiError } from './shared/errors.js';
import { MAX_BODY_SIZE, sendError } from './shared/http.js';

export function createApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify({
    ...options,
    bodyLimit: Math.min(options.bodyLimit ?? MAX_BODY_SIZE, MAX_BODY_SIZE),
    requestIdHeader: 'x-request-id',
  });

  app.register(sensible);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.setNotFoundHandler((request, reply) => {
    const error = new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
    return sendError(reply, error);
  });

  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  return app;
}
