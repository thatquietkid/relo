import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/shared/config.js';

describe('production configuration', () => {
  it('requires production Supabase configuration without printing secret values', () => {
    expect(() => loadConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: '',
      SUPABASE_PUBLISHABLE_KEY: '',
    })).toThrow('SUPABASE_URL is required');
  });

  it('returns an explicit readiness status for missing Supabase configuration', () => {
    const config = loadConfig({ NODE_ENV: 'development' });

    expect(config.readiness).toEqual({
      supabase: 'missing',
    });
  });

  it('accepts complete production configuration', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '4310',
      FRONTEND_ORIGIN: 'https://relo-web.onrender.com',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable-example',
    });

    expect(config.port).toBe(4310);
    expect(config.readiness).toEqual({ supabase: 'configured' });
  });

  it('keeps health live while readiness reports missing dependencies', async () => {
    const app = createApp({ logger: false }, {}, loadConfig({ NODE_ENV: 'development' }));

    const health = await app.inject({ method: 'GET', url: '/healthz' });
    const readiness = await app.inject({ method: 'GET', url: '/readyz' });

    expect(health.statusCode).toBe(200);
    expect(readiness.statusCode).toBe(503);
    expect(readiness.json()).toEqual({
      status: 'not_ready',
      checks: { supabase: 'missing' },
    });
  });

  it('reports ready when production Supabase configuration is present', async () => {
    const app = createApp({ logger: false }, {}, loadConfig({
      NODE_ENV: 'production',
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_PUBLISHABLE_KEY: 'publishable-example',
    }));

    const readiness = await app.inject({ method: 'GET', url: '/readyz' });

    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toEqual({
      status: 'ready',
      checks: { supabase: 'configured' },
    });
  });
});
