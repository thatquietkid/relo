import { describe, expect, it, vi } from 'vitest';
import { createSupabaseClient, createSupabasePort } from '../src/identity/supabase.js';

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
});
