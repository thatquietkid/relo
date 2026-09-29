import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/shared/config.js';

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

  it('returns the allowed origin on API POST responses', async () => {
    const frontendOrigin = 'https://relo-web-ernh.onrender.com';
    const app = createApp({ logger: false }, {}, {
      ...loadConfig(),
      frontendOrigin,
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      headers: {
        origin: frontendOrigin,
        'content-type': 'application/json',
      },
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers['access-control-allow-origin']).toBe(frontendOrigin);

    await app.close();
  });
});
