import { describe, expect, it, vi } from 'vitest';
import { makeAuthService } from '../src/identity/auth-service.js';
import type { SupabaseAuthPort } from '../src/identity/supabase.js';

function fakeSupabase(overrides: Partial<SupabaseAuthPort> = {}): SupabaseAuthPort {
  return {
    auth: {
      signInWithOtp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      verifyOtp: vi.fn().mockResolvedValue({
        data: {
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
            expires_at: 1_800_000_000,
            expires_in: 3600,
            token_type: 'bearer',
          },
          user: { id: 'user-1', email: 'employee@example.com' },
        },
        error: null,
      }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-1', email: 'employee@example.com' } },
        error: null,
      }),
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: 'https://accounts.google.com/oauth?state=1' },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    getActiveMemberships: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('auth service', () => {
  it('requests OTP without creating an unknown account', async () => {
    const supabase = fakeSupabase();
    const auth = makeAuthService({ supabase });

    await expect(auth.requestEmailOtp('employee@example.com')).resolves.toEqual({ accepted: true });
    expect(supabase.auth.signInWithOtp).toHaveBeenCalledWith({
      email: 'employee@example.com',
      options: { shouldCreateUser: false },
    });
  });

  it('rejects malformed OTP tokens before contacting Supabase', async () => {
    const supabase = fakeSupabase();
    const auth = makeAuthService({ supabase });

    await expect(auth.verifyEmailOtp('employee@example.com', '12345'))
      .rejects.toMatchObject({ code: 'INVALID_OTP' });
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled();
  });

  it('returns only safe session metadata and active memberships after OTP verification', async () => {
    const supabase = fakeSupabase({
      getActiveMemberships: vi.fn().mockResolvedValue([{
        id: 'membership-1',
        tenant_id: 'tenant-1',
        user_id: 'user-1',
        status: 'active',
        joined_at: '2026-09-28T00:00:00.000Z',
        suspended_at: null,
        tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme', status: 'active' },
        roles: [{ id: 'role-1', key: 'employee' }],
      }]),
    });
    const auth = makeAuthService({ supabase });

    await expect(auth.verifyEmailOtp('employee@example.com', '123456')).resolves.toEqual({
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: 1_800_000_000,
        expiresIn: 3600,
        tokenType: 'bearer',
      },
      identity: {
        user: { id: 'user-1', email: 'employee@example.com' },
        memberships: expect.any(Array),
      },
    });
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'employee@example.com',
      token: '123456',
      type: 'email',
    });
  });

  it('rejects a disallowed Google redirect target', async () => {
    const supabase = fakeSupabase();
    const auth = makeAuthService({ supabase, frontendOrigin: 'https://relo.example.com' });

    await expect(auth.getGoogleSignInUrl('https://evil.example.com/callback'))
      .rejects.toMatchObject({ code: 'REDIRECT_NOT_ALLOWED' });
    expect(supabase.auth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid current identity session', async () => {
    const supabase = fakeSupabase({
      auth: {
        ...fakeSupabase().auth,
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('invalid') }),
      },
    });
    const auth = makeAuthService({ supabase });

    await expect(auth.getCurrentIdentity('')).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    await expect(auth.getCurrentIdentity('bad-token')).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });
});
