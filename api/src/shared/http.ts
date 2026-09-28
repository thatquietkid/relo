import type { FastifyError, FastifyReply } from 'fastify';
import { ApiError, toApiErrorResponse } from './errors.js';

export const MAX_BODY_SIZE = 1_048_576;

function isClientErrorStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value < 500;
}

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  const candidate = error as FastifyError;
  const statusCode = isClientErrorStatus(candidate?.statusCode) ? candidate.statusCode : 500;

  if (statusCode === 413) {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }

  return new ApiError(
    statusCode,
    statusCode === 400 ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR',
    statusCode === 400 ? 'The request was invalid.' : 'An unexpected error occurred.',
    statusCode === 400 ? candidate?.validation : undefined,
  );
}

export function sendError(reply: FastifyReply, error: unknown) {
  const apiError = toApiError(error);
  return reply.status(apiError.statusCode).send(toApiErrorResponse(apiError, reply.request.id));
}
