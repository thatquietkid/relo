import { describe, expect, it } from 'vitest';
import { verifyDeployment } from '../../scripts/verify-deployment.mjs';

function response(status: number, headers: Record<string, string> = {}) { return new Response(null, { status, headers }); }
describe('deployment verifier', () => {
  it('fails verification when API readiness is unavailable', async () => {
    const fetchImpl = async (input: RequestInfo | URL) => String(input).endsWith('/readyz')
      ? response(503)
      : response(200, { 'content-security-policy': 'x', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
    await expect(verifyDeployment({ webUrl: 'https://web', apiUrl: 'https://api', fetchImpl })).rejects.toThrow('API readiness failed');
  });
  it('checks the live web and API contracts', async () => { const result = await verifyDeployment({ webUrl: 'https://web', apiUrl: 'https://api', fetchImpl: async (_input: RequestInfo | URL) => response(200, { 'content-security-policy': 'x', 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'content-encoding': 'gzip' }) }); expect(result.readiness).toBe(200); expect(result.contentEncoding).toBe('gzip'); });
});
