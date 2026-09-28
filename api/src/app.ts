import sensible from '@fastify/sensible';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyServerOptions,
} from 'fastify';
import { ApiError, toApiErrorResponse } from './shared/errors.js';

export function createApp(options: FastifyServerOptions = {}): FastifyInstance {
  const app = Fastify(options);

  app.register(sensible);

  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.setNotFoundHandler((request, reply) => {
    const error = new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
    return reply.status(error.statusCode).send(toApiErrorResponse(error, request.id));
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.statusCode).send(toApiErrorResponse(error, request.id));
    }

    const candidateStatusCode = error.statusCode ?? 500;
    const statusCode = candidateStatusCode >= 400 && candidateStatusCode < 500 ? candidateStatusCode : 500;
    const apiError = new ApiError(
      statusCode,
      statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
      statusCode === 400 ? 'The request was invalid.' : 'An unexpected error occurred.',
      statusCode === 400 ? error.validation : undefined,
    );
    return reply.status(apiError.statusCode).send(toApiErrorResponse(apiError, request.id));
  });

  return app;
}
