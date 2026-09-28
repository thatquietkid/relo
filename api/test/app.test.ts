import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('API foundation', () => {
  it('exposes a health response and stable error shape', async () => {
    const app = createApp({ logger: false });

    expect(typeof app.inject).toBe('function');

    const health = await app.inject({ method: 'GET', url: '/healthz' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });

    const missing = await app.inject({ method: 'GET', url: '/not-a-route' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');
    expect(missing.json().error.requestId).toEqual(expect.any(String));

    await app.close();
  });
});
