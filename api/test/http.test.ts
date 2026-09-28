import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { parseJsonBody, parseIdempotencyKey } from '../src/shared/validation.js';

describe('HTTP validation helpers', () => {
  it('rejects invalid JSON input with field details', () => {
    expect(() => parseJsonBody(z.object({ email: z.string().email() }), { email: 'bad' }))
      .toThrow(expect.objectContaining({ code: 'VALIDATION_ERROR' }));
  });

  it('accepts only bounded idempotency keys', () => {
    expect(parseIdempotencyKey('invite-123')).toBe('invite-123');
    expect(() => parseIdempotencyKey('')).toThrow();
    expect(() => parseIdempotencyKey('x'.repeat(129))).toThrow();
  });

  it('propagates request IDs and serializes oversized bodies safely', async () => {
    const app = createApp({ logger: false, bodyLimit: 32 });
    app.post('/echo', async (request) => request.body);

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'request-test-1',
      },
      payload: JSON.stringify({ value: 'x'.repeat(100) }),
    });

    expect(response.statusCode).toBe(413);
    expect(response.headers['x-request-id']).toBe('request-test-1');
    expect(response.json()).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large.',
        requestId: 'request-test-1',
      },
    });
    expect(response.body).not.toContain('stack');

    await app.close();
  });

  it('does not serialize internal error details', async () => {
    const app = createApp({ logger: false });
    app.get('/boom', async () => {
      throw new Error('secret internal detail');
    });

    const response = await app.inject({ method: 'GET', url: '/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
        requestId: expect.any(String),
      },
    });
    expect(response.body).not.toContain('secret internal detail');
    expect(response.body).not.toContain('stack');

    await app.close();
  });
});
