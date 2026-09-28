import { describe, expect, it } from 'vitest';
import { readinessStatus } from '../src/observability/health.js';
describe('health signals', () => {
  it('keeps liveness independent from dependency readiness', async () => {
    expect((await readinessStatus({ configured: true, probe: async () => false })).status).toBe('not_ready');
    expect((await readinessStatus({ configured: true, probe: async () => true })).status).toBe('ready');
  });
});
