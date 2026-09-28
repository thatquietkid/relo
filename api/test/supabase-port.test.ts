import { describe, expect, it, vi } from 'vitest';
import { createSupabaseClient, createSupabasePort } from '../src/identity/supabase.js';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('Supabase bearer-bound REST ports', () => {
  it('uses the incoming bearer for OAuth details and session logout', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: 'https://client.example/callback?code=1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: 'https://client.example/callback?code=1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ redirect_url: 'https://client.example/callback?code=1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createSupabaseClient({ url: 'https://relo.supabase.co', publishableKey: 'publishable-key' });
    const port = createSupabasePort(client, {
      url: 'https://relo.supabase.co',
      publishableKey: 'publishable-key',
      accessToken: 'incoming-token',
      fetch: fetcher,
    });

    await expect(port.getAuthorizationDetails('auth-1')).resolves.toEqual({
      data: { redirect_url: 'https://client.example/callback?code=1' }, error: null,
    });
    await expect(port.approveAuthorization('auth-1')).resolves.toEqual({
      data: { redirect_url: 'https://client.example/callback?code=1' }, error: null,
    });
    await expect(port.denyAuthorization('auth-1')).resolves.toEqual({
      data: { redirect_url: 'https://client.example/callback?code=1' }, error: null,
    });
    await expect(port.auth.signOut('incoming-token')).resolves.toEqual({ error: null });

    expect(fetcher).toHaveBeenNthCalledWith(1, 'https://relo.supabase.co/auth/v1/oauth/authorizations/auth-1', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer incoming-token' }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'https://relo.supabase.co/auth/v1/oauth/authorizations/auth-1/consent', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer incoming-token' }),
      body: JSON.stringify({ action: 'approve' }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'https://relo.supabase.co/auth/v1/oauth/authorizations/auth-1/consent', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer incoming-token' }),
      body: JSON.stringify({ action: 'deny' }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(4, 'https://relo.supabase.co/auth/v1/logout?scope=local', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer incoming-token' }),
    }));
  });

  it('loads all authorization memberships through the no-argument RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: 'membership-active',
        tenant_id: 'tenant-a',
        user_id: 'user-1',
        status: 'active',
        joined_at: '2026-09-28T00:00:00.000Z',
        suspended_at: null,
        tenant: { id: 'tenant-a', name: 'Tenant A', slug: 'tenant-a', status: 'active' },
        roles: [{ id: 'role-employee', key: 'employee' }],
      }, {
        id: 'membership-suspended',
        tenant_id: 'tenant-b',
        user_id: 'user-1',
        status: 'suspended',
        joined_at: '2026-09-28T00:00:00.000Z',
        suspended_at: '2026-09-28T01:00:00.000Z',
        tenant: { id: 'tenant-b', name: 'Tenant B', slug: 'tenant-b', status: 'active' },
        roles: [{ id: 'role-hr', key: 'hr' }],
      }, {
        id: 'membership-revoked',
        tenant_id: 'tenant-c',
        user_id: 'user-1',
        status: 'revoked',
        joined_at: '2026-09-28T00:00:00.000Z',
        suspended_at: null,
        tenant: { id: 'tenant-c', name: 'Tenant C', slug: 'tenant-c', status: 'active' },
        roles: [{ id: 'role-reviewer', key: 'reviewer' }],
      }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;
    const port = createSupabasePort(client);

    await expect(port.getMemberships?.()).resolves.toHaveLength(3);
    expect(rpc).toHaveBeenCalledWith('get_authorization_memberships');
  });

  it('loads trusted platform scope through the no-argument RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    const port = createSupabasePort({ rpc } as unknown as SupabaseClient);

    await expect(port.isPlatformAdmin?.()).resolves.toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_platform_admin');
  });
});
