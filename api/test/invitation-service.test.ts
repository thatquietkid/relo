import { describe, expect, it, vi } from 'vitest';
import { makeInvitationService } from '../src/identity/invitation-service.js';
import type { SupabaseError, SupabaseInvitationPort } from '../src/identity/supabase.js';

const membership = {
  id: 'membership-1',
  tenant_id: 'tenant-1',
  user_id: 'user-1',
  status: 'active' as const,
  joined_at: '2026-09-28T00:00:00.000Z',
  suspended_at: null,
  tenant: { id: 'tenant-1', name: 'Acme', slug: 'acme', status: 'active' as const },
  roles: [{ id: 'role-1', key: 'employee' }],
};

function fakeSupabase(result: { data: typeof membership | null; error: SupabaseError | null } = { data: membership, error: null }): SupabaseInvitationPort {
  return { acceptInvitation: vi.fn().mockResolvedValue(result) };
}

describe('invitation service', () => {
  it('accepts an invitation through the transactional Supabase function', async () => {
    const supabase = fakeSupabase();
    const service = makeInvitationService({ supabase });

    await expect(service.acceptInvitation('user-1', 'raw-token')).resolves.toEqual(membership);
    expect(supabase.acceptInvitation).toHaveBeenCalledWith('user-1', 'raw-token');
  });

  it('rejects invitation acceptance when email does not match', async () => {
    const supabase = fakeSupabase({ data: null, error: { code: 'INVITATION_EMAIL_MISMATCH', message: 'email mismatch' } });
    const service = makeInvitationService({ supabase });

    await expect(service.acceptInvitation('user-1', 'token-for-other@example.com'))
      .rejects.toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
  });

  it.each([
    ['invalid token', 'INVITATION_INVALID_TOKEN'],
    ['expired token', 'INVITATION_EXPIRED'],
    ['replayed token', 'INVITATION_ALREADY_ACCEPTED'],
  ])('maps a %s to a stable API conflict', async (_label, code) => {
    const service = makeInvitationService({
      supabase: fakeSupabase({ data: null, error: { code, message: code } }),
    });

    await expect(service.acceptInvitation('user-1', 'raw-token')).rejects.toMatchObject({ code });
  });

  it('maps a PostgreSQL exception message to the stable invitation code', async () => {
    const service = makeInvitationService({
      supabase: fakeSupabase({ data: null, error: { code: 'P0001', message: 'INVITATION_EMAIL_MISMATCH' } }),
    });

    await expect(service.acceptInvitation('user-1', 'raw-token'))
      .rejects.toMatchObject({ code: 'INVITATION_EMAIL_MISMATCH' });
  });

  it('does not turn an upstream invitation failure into a false invalid-token result', async () => {
    const service = makeInvitationService({
      supabase: fakeSupabase({ data: null, error: { code: '42501', message: 'permission denied' } }),
    });

    await expect(service.acceptInvitation('user-1', 'raw-token'))
      .rejects.toMatchObject({ code: 'INVITATION_PROVIDER_ERROR' });
  });
});
