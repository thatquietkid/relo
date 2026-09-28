import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { createApp } from '../src/app.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';
import { assertTenantAccess, can, PERMISSIONS } from '../src/authorization/policy.js';
import { makeAuthorizationHooks } from '../src/authorization/require-auth.js';
import { requireRole } from '../src/authorization/require-role.js';

function membership(
  tenantId: string,
  status: MembershipView['status'] = 'active',
  roles: string[] = ['employee'],
): MembershipView {
  return {
    id: `membership-${tenantId}`,
    tenant_id: tenantId,
    user_id: 'user-1',
    status,
    joined_at: '2026-09-28T00:00:00.000Z',
    suspended_at: status === 'suspended' ? '2026-09-28T01:00:00.000Z' : null,
    tenant: { id: tenantId, name: tenantId, slug: tenantId, status: 'active' },
    roles: roles.map((key) => ({ id: `role-${key}`, key })),
  };
}

function identityFor(tenantId: string, status: MembershipView['status'] = 'active', roles = ['employee']): IdentityContext {
  return {
    user: { id: 'user-1', email: 'employee@example.com' },
    memberships: [membership(tenantId, status, roles)],
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
    await expect(hooks.requireAuth(selected)).resolves.toEqual(identity);
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

  it('allows a resolved role and computes known permissions only', () => {
    const identity = identityFor('tenant-a', 'active', ['hr', 'reviewer']);

    expect(can(identity, PERMISSIONS.HR_WRITE)).toBe(true);
    expect(can(identity, PERMISSIONS.CONTENT_PUBLISH)).toBe(true);
    expect(can(identity, 'unknown:permission')).toBe(false);
  });

  it('does not grant platform permissions to an ordinary tenant admin', () => {
    expect(can(identityFor('tenant-a', 'active', ['admin']), PERMISSIONS.PLATFORM_TENANTS_MANAGE)).toBe(false);
    expect(can({ ...identityFor('tenant-a', 'active', ['admin']), platformScope: true }, PERMISSIONS.PLATFORM_TENANTS_MANAGE))
      .toBe(true);
  });

  it('does not let a tenant admin satisfy a platform admin route', async () => {
    const app = createApp({ logger: false });
    const hooks = makeAuthorizationHooks({ authService: fakeAuth(identityFor('tenant-a', 'active', ['admin'])) });
    app.get('/platform-only', { preHandler: [hooks.requireAuth, requireRole('admin')] }, async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/platform-only',
      headers: { authorization: 'Bearer valid-token' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ROLE_REQUIRED');
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
