import { describe, expect, it, vi } from 'vitest';
import { allowedOrigin, securityHeaders } from '../src/security/cors.js';
import { redact } from '../src/security/audit.js';
import { makeRateLimiter } from '../src/security/rate-limit.js';

describe('security controls', () => {
  it('rejects unconfigured origins and emits a restrictive CSP', () => {
    expect(allowedOrigin('https://evil.example', { FRONTEND_ORIGIN: 'https://relo-web.onrender.com', SUPABASE_URL: 'https://example.supabase.co' })).toBe(false);
    expect(allowedOrigin('https://relo-web.onrender.com', { FRONTEND_ORIGIN: 'https://relo-web.onrender.com', SUPABASE_URL: 'https://example.supabase.co' })).toBe(true);
    expect(securityHeaders({ FRONTEND_ORIGIN: 'https://relo-web.onrender.com', SUPABASE_URL: 'https://example.supabase.co' })['Content-Security-Policy']).toContain("default-src 'self'");
  });
  it('redacts tokens and OTP values from audit metadata', () => {
    expect(redact({ authorization: 'Bearer secret', otp: '123456', nested: { password: 'secret' } })).toEqual({ authorization: '[REDACTED]', otp: '[REDACTED]', nested: { password: '[REDACTED]' } });
  });
  it('allows only the configured number of requests per window', () => {
    const limiter = makeRateLimiter({ limit: 1, windowMs: 60_000, now: () => 100 });
    expect(limiter('ip')).toEqual({ allowed: true, remaining: 0 }); expect(limiter('ip')).toMatchObject({ allowed: false, remaining: 0 });
  });
});
