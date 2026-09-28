import { describe, expect, it, vi } from 'vitest';
import { makeConsentService } from '../src/oauth/consent-service.js';
import type { SupabaseOAuthPort } from '../src/identity/supabase.js';

const identity = {
  user: { id: 'user-1', email: 'employee@example.com' },
  memberships: [{
    id: 'membership-1',
    tenant_id: 'tenant-1',
    user_id: 'user-1',
    status: 'active' as const,
    joined_at: '2026-09-28T00:00:00.000Z',
    suspended_at: null,
    tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme', status: 'active' as const },
    roles: [{ id: 'role-1', key: 'employee' }],
  }],
};

function fakeOAuth(): SupabaseOAuthPort {
  return {
    getAuthorizationDetails: vi.fn().mockResolvedValue({
      data: { authorization_id: 'auth-1', client_name: 'Move App', scopes: ['profile'] },
      error: null,
    }),
    approveAuthorization: vi.fn().mockResolvedValue({ data: { redirect_url: 'https://client.example/cb' }, error: null }),
    denyAuthorization: vi.fn().mockResolvedValue({ data: { redirect_url: 'https://client.example/denied' }, error: null }),
  };
}

describe('OAuth consent service', () => {
  it('denies an OAuth consent request without an authenticated Relo identity', async () => {
    const oauth = makeConsentService({ supabase: fakeOAuth() });

    await expect(oauth.getAuthorizationDetails(null, 'auth-1'))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('denies a valid Supabase user without an active Relo membership', async () => {
    const oauth = makeConsentService({ supabase: fakeOAuth() });

    await expect(oauth.getAuthorizationDetails({ user: identity.user, memberships: [] }, 'auth-1'))
      .rejects.toMatchObject({ code: 'MEMBERSHIP_REQUIRED' });
  });

  it('preserves the previous role gate for unsupported active memberships', async () => {
    const oauth = makeConsentService({ supabase: fakeOAuth() });
    const reviewerIdentity = {
      ...identity,
      memberships: identity.memberships.map((membership) => ({
        ...membership,
        roles: [{ id: 'role-reviewer', key: 'reviewer' }],
      })),
    };

    await expect(oauth.getAuthorizationDetails(reviewerIdentity, 'auth-1'))
      .rejects.toMatchObject({ code: 'OAUTH_CONSENT_FORBIDDEN' });
  });

  it('delegates authorization details only for the logged-in Relo identity', async () => {
    const supabase = fakeOAuth();
    supabase.getAuthorizationDetails = vi.fn().mockResolvedValue({
      data: {
        authorization_id: 'auth-1',
        client: { name: 'Move App', uri: 'https://move.example' },
        redirect_uri: 'https://client.example/cb',
        scope: 'openid email',
      },
      error: null,
    });
    const oauth = makeConsentService({ supabase });

    await expect(oauth.getAuthorizationDetails(identity, 'auth-1')).resolves.toEqual({
      authorization_id: 'auth-1',
      client: { name: 'Move App', uri: 'https://move.example' },
      redirect_uri: 'https://client.example/cb',
      scope: 'openid email',
    });
    expect(supabase.getAuthorizationDetails).toHaveBeenCalledWith('auth-1');
  });

  it('delegates approve and deny decisions and returns safe redirect metadata', async () => {
    const supabase = fakeOAuth();
    const oauth = makeConsentService({ supabase });

    await expect(oauth.approveAuthorization(identity, 'auth-1')).resolves.toEqual({
      redirectUrl: 'https://client.example/cb',
    });
    await expect(oauth.denyAuthorization(identity, 'auth-1')).resolves.toEqual({
      redirectUrl: 'https://client.example/denied',
    });
    expect(supabase.approveAuthorization).toHaveBeenCalledWith('auth-1');
    expect(supabase.denyAuthorization).toHaveBeenCalledWith('auth-1');
  });

  it('normalizes an already-consented redirect-only response', async () => {
    const supabase = fakeOAuth();
    supabase.getAuthorizationDetails = vi.fn().mockResolvedValue({
      data: { redirect_url: 'https://client.example/callback?code=one-time-code' },
      error: null,
    });
    const oauth = makeConsentService({ supabase });

    await expect(oauth.getAuthorizationDetails(identity, 'auth-1')).resolves.toEqual({
      alreadyHandled: true,
      redirectUrl: 'https://client.example/callback?code=one-time-code',
    });
  });
});
