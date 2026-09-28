import { z } from 'zod';
import type { IdempotencyKey } from '@relo/contracts/http';
import { ApiError } from './errors.js';

export function parseJsonBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);

  if (!result.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The request body is invalid.', {
      issues: result.error.issues.map((issue) => ({
        code: issue.code,
        message: issue.message,
        path: issue.path,
      })),
    });
  }

  return result.data;
}

export function parseIdempotencyKey(value: unknown): IdempotencyKey {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{8,128}$/.test(value)) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Idempotency-Key must be 8 to 128 printable ASCII characters.',
    );
  }

  return value as IdempotencyKey;
}
