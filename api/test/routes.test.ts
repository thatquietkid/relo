import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { InvitationService } from '../src/identity/invitation-service.js';
import type { ConsentService } from '../src/oauth/consent-service.js';

const identity = { user: { id: 'user-1', email: 'employee@example.com' }, memberships: [] };
const membership = {
  id: 'membership-1', tenant_id: 'tenant-1', user_id: 'user-1', status: 'active' as const,
  joined_at: '2026-09-28T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme', status: 'active' as const },
  roles: [{ id: 'role-1', key: 'employee' }],
};

function services() {
  const authService: AuthService = {
    requestEmailOtp: vi.fn().mockResolvedValue({ accepted: true }),
    verifyEmailOtp: vi.fn().mockResolvedValue({
      session: { accessToken: 'access', refreshToken: 'refresh', expiresAt: null, expiresIn: null, tokenType: 'bearer' },
      identity,
    }),
    getGoogleSignInUrl: vi.fn().mockResolvedValue('https://accounts.google.com/oauth'),
    getCurrentIdentity: vi.fn().mockResolvedValue(identity),
    logout: vi.fn().mockResolvedValue({ signedOut: true }),
  };
  const invitationService: InvitationService = {
    acceptInvitation: vi.fn().mockResolvedValue(membership),
  };
  const consentService: ConsentService = {
    getAuthorizationDetails: vi.fn().mockResolvedValue({ authorization_id: 'auth-1', client_name: 'Move App', scopes: [] }),
    approveAuthorization: vi.fn().mockResolvedValue({ redirectUrl: 'https://client.example/cb' }),
    denyAuthorization: vi.fn().mockResolvedValue({ redirectUrl: 'https://client.example/denied' }),
  };
  return { authService, invitationService, consentService };
}

describe('Task 4 API routes', () => {
  it('exposes auth and invitation routes behind typed request boundaries', async () => {
    const deps = services();
    const app = createApp({ logger: false }, deps);

    const otp = await app.inject({
      method: 'POST', url: '/api/v1/auth/otp/request',
      payload: { email: 'employee@example.com' },
    });
    expect(otp.statusCode).toBe(200);
    expect(otp.json()).toEqual({ accepted: true });

    const invalid = await app.inject({
      method: 'POST', url: '/api/v1/auth/otp/verify',
      payload: { email: 'employee@example.com', token: 'bad' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error.code).toBe('VALIDATION_ERROR');

    const missing = await app.inject({ method: 'GET', url: '/api/v1/auth/me' });
    expect(missing.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('AUTHENTICATION_REQUIRED');

    const accepted = await app.inject({
      method: 'POST', url: '/api/v1/invitations/invite-token/accept',
      headers: { authorization: 'Bearer access-token' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toEqual({ membership });
    expect(deps.invitationService.acceptInvitation).toHaveBeenCalledWith('user-1', 'invite-token');

    await app.close();
  });

  it('exposes Google and OAuth consent routes without leaking provider credentials', async () => {
    const deps = services();
    const app = createApp({ logger: false }, deps);

    const google = await app.inject({ method: 'GET', url: '/api/v1/auth/google/start?redirect_to=https%3A%2F%2Frelo.example%2Fauth' });
    expect(google.statusCode).toBe(200);
    expect(google.json()).toEqual({ url: 'https://accounts.google.com/oauth' });

    const details = await app.inject({
      method: 'GET', url: '/api/v1/oauth/authorization-details?authorization_id=auth-1',
      headers: { authorization: 'Bearer access-token' },
    });
    expect(details.statusCode).toBe(200);
    expect(details.json()).toEqual({ authorization: { authorization_id: 'auth-1', client_name: 'Move App', scopes: [] } });

    const approved = await app.inject({
      method: 'POST', url: '/api/v1/oauth/approve',
      headers: { authorization: 'Bearer access-token' }, payload: { authorizationId: 'auth-1' },
    });
    expect(approved.json()).toEqual({ redirectUrl: 'https://client.example/cb' });

    const denied = await app.inject({
      method: 'POST', url: '/api/v1/oauth/deny',
      headers: { authorization: 'Bearer access-token' }, payload: { authorizationId: 'auth-1' },
    });
    expect(denied.json()).toEqual({ redirectUrl: 'https://client.example/denied' });
    expect(JSON.stringify(approved.json())).not.toContain('service_role');

    await app.close();
  });
});
