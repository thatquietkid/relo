import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createApp } from '../src/app.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';
import { assertTenantAccess, can, PERMISSIONS, type AuthorizationContext } from '../src/authorization/policy.js';
import { makeAuthorizationHooks } from '../src/authorization/require-auth.js';
import { requireRole } from '../src/authorization/require-role.js';
import { createSupabasePort } from '../src/identity/supabase.js';

function membership(
  tenantId: string,
  status: MembershipView['status'] = 'active',
  roles: string[] = ['employee'],
  tenantStatus: MembershipView['tenant']['status'] = 'active',
): MembershipView {
  return {
    id: `membership-${tenantId}`,
    tenant_id: tenantId,
    user_id: 'user-1',
    status,
    joined_at: '2026-09-28T00:00:00.000Z',
    suspended_at: status === 'suspended' ? '2026-09-28T01:00:00.000Z' : null,
    tenant: { id: tenantId, name: tenantId, slug: tenantId, status: tenantStatus },
    roles: roles.map((key) => ({ id: `role-${key}`, key })),
  };
}

function identityFor(
  tenantId: string,
  status: MembershipView['status'] = 'active',
  roles = ['employee'],
  tenantStatus: MembershipView['tenant']['status'] = 'active',
): IdentityContext {
  return {
    user: { id: 'user-1', email: 'employee@example.com' },
    memberships: [membership(tenantId, status, roles, tenantStatus)],
  };
}

function fakeAuth(identity: IdentityContext): AuthService {
  return {
    requestEmailOtp: vi.fn(),
    verifyEmailOtp: vi.fn(),
    getGoogleSignInUrl: vi.fn(),
    getCurrentIdentity: vi.fn().mockResolvedValue(identity),
    logout: vi.fn(),
  };
}

function requestWith(headers: Record<string, string> = {}) {
  return { headers } as unknown as FastifyRequest;
}

describe('authorization policy', () => {
  it('denies a valid user from another tenant', () => {
    expect(() => assertTenantAccess(identityFor('tenant-a'), 'tenant-b'))
      .toThrow(expect.objectContaining({ code: 'TENANT_ACCESS_DENIED' }));
  });

  it('allows access to a tenant in the resolved identity', () => {
    expect(() => assertTenantAccess(identityFor('tenant-a'), 'tenant-a')).not.toThrow();
  });

  it('denies a suspended membership', async () => {
    const hooks = makeAuthorizationHooks({
      authService: fakeAuth(identityFor('tenant-a', 'suspended')),
    });

    await expect(hooks.requireAuth(requestWith({ authorization: 'Bearer valid-token' })))
      .rejects.toMatchObject({ code: 'MEMBERSHIP_SUSPENDED' });
  });

  it('rejects missing and invalid bearer sessions with stable codes', async () => {
    const authService = fakeAuth(identityFor('tenant-a'));
    vi.mocked(authService.getCurrentIdentity).mockRejectedValueOnce(new Error('invalid token'));
    const hooks = makeAuthorizationHooks({ authService });

    await expect(hooks.requireAuth(requestWith())).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
    await expect(hooks.requireAuth(requestWith({ authorization: 'Bearer invalid-token' })))
      .rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  it('selects a single active tenant without requiring a header', async () => {
    const request = requestWith({ authorization: 'Bearer valid-token' });
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identityFor('tenant-a')) });

    const identity = await hooks.requireAuth(request);

    expect(identity.user.id).toBe('user-1');
    expect(request.relo).toEqual({
      identity,
      tenantId: 'tenant-a',
      membership: identity.memberships[0],
      permissions: expect.arrayContaining([PERMISSIONS.EMPLOYEE_READ]),
    });
  });

  it('requires explicit selection when multiple active tenants exist', async () => {
    const identity = { ...identityFor('tenant-a'), memberships: [membership('tenant-a'), membership('tenant-b')] };
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identity) });

    await expect(hooks.requireAuth(requestWith({ authorization: 'Bearer valid-token' })))
      .rejects.toMatchObject({ code: 'TENANT_SELECTION_REQUIRED' });
  });

  it('uses a valid tenant selection and rejects a cross-tenant selection', async () => {
    const identity = { ...identityFor('tenant-a'), memberships: [membership('tenant-a'), membership('tenant-b')] };
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identity) });

    const selected = requestWith({ authorization: 'Bearer valid-token', 'x-tenant-id': 'tenant-b' });
    await expect(hooks.requireAuth(selected)).resolves.toMatchObject({ ...identity, platformScope: false });
    expect(selected.relo?.tenantId).toBe('tenant-b');

    await expect(hooks.requireAuth(requestWith({ authorization: 'Bearer valid-token', 'x-tenant-id': 'tenant-c' })))
      .rejects.toMatchObject({ code: 'TENANT_ACCESS_DENIED' });
  });

  it('rejects a revoked selected membership', async () => {
    const identity = { ...identityFor('tenant-a'), memberships: [membership('tenant-a', 'revoked')] };
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identity) });

    await expect(hooks.requireAuth(requestWith({
      authorization: 'Bearer valid-token',
      'x-tenant-id': 'tenant-a',
      }))).rejects.toMatchObject({ code: 'MEMBERSHIP_REVOKED' });
  });

  it('loads all membership statuses from the authorization loader for each protected request', async () => {
    const memberships = [
      membership('tenant-a'),
      membership('tenant-b', 'suspended'),
      membership('tenant-c', 'revoked'),
    ];
    const loadMemberships = vi.fn().mockResolvedValue(memberships);
    const hooks = makeAuthorizationHooks({
      authService: fakeAuth(identityFor('tenant-a')),
      loadMemberships,
    });

    await expect(hooks.requireAuth(requestWith({
      authorization: 'Bearer valid-token',
      'x-tenant-id': 'tenant-b',
    }))).rejects.toMatchObject({ code: 'MEMBERSHIP_SUSPENDED' });
    await expect(hooks.requireAuth(requestWith({
      authorization: 'Bearer valid-token',
      'x-tenant-id': 'tenant-c',
    }))).rejects.toMatchObject({ code: 'MEMBERSHIP_REVOKED' });
    expect(loadMemberships).toHaveBeenCalledTimes(2);
    expect(loadMemberships).toHaveBeenNthCalledWith(1, 'user-1', 'valid-token');
  });

  it('composes production-shaped RPC membership and platform lookups into tenant and tenantless contexts', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({
        data: [membership('tenant-a'), membership('tenant-b', 'active', ['hr'])],
        error: null,
      })
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const createPort = vi.fn(() => createSupabasePort({ rpc } as unknown as SupabaseClient));

    const tenantHooks = makeAuthorizationHooks({
      authService: fakeAuth(identityFor('tenant-a')),
      createSupabasePort: createPort,
    });
    const tenantRequest = requestWith({
      authorization: 'Bearer valid-token',
      'x-tenant-id': 'tenant-b',
    });
    await tenantHooks.requireAuth(tenantRequest);
    expect(tenantRequest.relo?.tenantId).toBe('tenant-b');
    expect(tenantRequest.relo?.membership?.roles[0]?.key).toBe('hr');

    const platformHooks = makeAuthorizationHooks({
      authService: fakeAuth({
        user: { id: 'platform-user', email: 'platform@example.com' },
        memberships: [],
      }),
      createSupabasePort: createPort,
    });
    const platformRequest = requestWith({ authorization: 'Bearer valid-token' });
    await platformHooks.requireAuth(platformRequest);
    expect(platformRequest.relo?.tenantId).toBeNull();
    expect(platformRequest.relo?.membership).toBeNull();
    expect(platformRequest.relo?.identity.platformRoles).toEqual(['platform_admin']);

    expect(rpc).toHaveBeenNthCalledWith(1, 'get_authorization_memberships');
    expect(rpc).toHaveBeenNthCalledWith(2, 'is_platform_admin');
    expect(rpc).toHaveBeenNthCalledWith(3, 'get_authorization_memberships');
    expect(rpc).toHaveBeenNthCalledWith(4, 'is_platform_admin');
    expect(createPort).toHaveBeenCalledWith('valid-token');
    expect(createPort).toHaveBeenCalledTimes(4);
  });

  it('denies an inactive tenant even when its membership is active', async () => {
    const hooks = makeAuthorizationHooks({
      authService: fakeAuth(identityFor('tenant-a', 'active', ['employee'], 'suspended')),
    });

    await expect(hooks.requireAuth(requestWith({ authorization: 'Bearer valid-token' })))
      .rejects.toMatchObject({ code: 'TENANT_ACCESS_DENIED' });
  });

  it('denies a role from the request body when the resolved membership lacks it', async () => {
    const app = createApp({ logger: false });
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identityFor('tenant-a', 'active', ['employee'])) });
    app.post('/protected-role', { preHandler: [hooks.requireAuth, requireRole('hr')] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'POST',
      url: '/protected-role',
      headers: { authorization: 'Bearer valid-token' },
      payload: { tenant_id: 'tenant-a', role: 'hr' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: 'ROLE_REQUIRED',
        message: 'The required role is not assigned.',
        requestId: expect.any(String),
      },
    });
    await app.close();
  });

  it('allows permissions from the selected tenant context and denies unknown permissions', async () => {
    const identity = identityFor('tenant-a', 'active', ['hr', 'reviewer']);
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identity) });
    const request = requestWith({ authorization: 'Bearer valid-token' });
    await hooks.requireAuth(request);

    expect(can(request.relo as AuthorizationContext, PERMISSIONS.HR_WRITE)).toBe(true);
    expect(can(request.relo as AuthorizationContext, PERMISSIONS.CONTENT_PUBLISH)).toBe(true);
    expect(can(request.relo as AuthorizationContext, 'unknown:permission')).toBe(false);
  });

  it('requires an explicit tenant when using the identity convenience overload', () => {
    const identity = {
      ...identityFor('tenant-a', 'active', ['hr']),
      memberships: [membership('tenant-a', 'active', ['hr']), membership('tenant-b', 'active', ['employee'])],
    };

    expect(can(identity, PERMISSIONS.HR_WRITE)).toBe(false);
    expect(can(identity, PERMISSIONS.HR_WRITE, 'tenant-a')).toBe(true);
    expect(can(identity, PERMISSIONS.HR_WRITE, 'tenant-b')).toBe(false);
    expect(can(identity, PERMISSIONS.HR_WRITE, 'tenant-c')).toBe(false);
  });

  it('keeps tenant admin distinct from platform admin', async () => {
    const tenantAdmin = identityFor('tenant-a', 'active', ['admin']);
    const tenantHooks = makeAuthorizationHooks({ authService: fakeAuth(tenantAdmin) });
    const tenantRequest = requestWith({ authorization: 'Bearer valid-token' });
    await tenantHooks.requireAuth(tenantRequest);
    expect(can(tenantRequest.relo as AuthorizationContext, PERMISSIONS.TENANT_ADMIN_WRITE)).toBe(true);
    expect(can(tenantRequest.relo as AuthorizationContext, PERMISSIONS.PLATFORM_TENANTS_MANAGE)).toBe(false);

    const platformContext: AuthorizationContext = {
      identity: {
        user: { id: 'platform-user', email: 'platform@example.com' },
        memberships: [],
        platformScope: true,
        platformRoles: ['platform_admin'],
      },
      tenantId: null,
      membership: null,
      permissions: [PERMISSIONS.PLATFORM_TENANTS_MANAGE],
    };
    expect(can(platformContext, PERMISSIONS.PLATFORM_TENANTS_MANAGE)).toBe(true);
  });

  it('does not let a tenant admin satisfy a platform admin route', async () => {
    const app = createApp({ logger: false });
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identityFor('tenant-a', 'active', ['admin'])) });
    app.get('/platform-only', { preHandler: [hooks.requireAuth, requireRole('platform_admin')] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/platform-only',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ROLE_REQUIRED');
    await app.close();
  });

  it('allows a tenant admin through a tenant-scoped admin route without platform scope', async () => {
    const app = createApp({ logger: false });
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identityFor('tenant-a', 'active', ['admin'])) });
    app.get('/tenant-admin-only', { preHandler: [hooks.requireAuth, requireRole('admin')] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/tenant-admin-only',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('allows a trusted platform admin without tenant selection or membership', async () => {
    const app = createApp({ logger: false });
    const identity: IdentityContext = {
      user: { id: 'platform-user', email: 'platform@example.com' },
      memberships: [],
      platformScope: true,
      platformRoles: ['platform_admin'],
    };
    const hooks = makeAuthorizationHooks({
      authService: fakeAuth(identity),
      resolvePlatformScope: vi.fn().mockResolvedValue(true),
    });
    app.get('/platform-only', { preHandler: [hooks.requireAuth, requireRole('platform_admin')] }, async (request) => ({
      ok: true,
      tenantId: request.relo?.tenantId,
      membership: request.relo?.membership,
    }));

    const response = await app.inject({
      method: 'GET',
      url: '/platform-only',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, tenantId: null, membership: null });
    await app.close();
  });

  it('serializes missing bearer failures through the app error envelope', async () => {
    const app = createApp({ logger: false });
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identityFor('tenant-a')) });
    app.get('/protected-auth', { preHandler: hooks.requireAuth }, async () => ({ ok: true }));

    const response = await app.inject({ method: 'GET', url: '/protected-auth' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: 'AUTHENTICATION_REQUIRED',
        message: 'Authentication is required.',
        requestId: expect.any(String),
      },
    });
    await app.close();
  });
});
