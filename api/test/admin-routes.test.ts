import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';

const adminMembership: MembershipView = {
  id: 'membership-admin', tenant_id: 'tenant-a', user_id: 'admin-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-admin', key: 'admin' }],
};
const admin: IdentityContext = { user: { id: 'admin-a', email: 'admin@example.com' }, memberships: [adminMembership] };

const authService: AuthService = {
  requestEmailOtp: async () => ({ accepted: true }),
  verifyEmailOtp: async () => { throw new Error('unused'); },
  getGoogleSignInUrl: async () => 'https://accounts.google.com',
  getCurrentIdentity: async () => admin,
  logout: async () => ({ signedOut: true }),
};

describe('tenant admin activity feed', () => {
  it('passes an activity category filter to the repository', async () => {
    let received: unknown;
    const app = createApp({ logger: false }, {
      authService,
      adminEventsRepository: {
        async listEvents(input) {
          received = input;
          return { items: [], total: 0 };
        },
      },
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/events?resourceType=invitation',
      headers: { authorization: 'Bearer admin-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(received).toEqual({ page: 1, pageSize: 20, resourceType: 'invitation' });
    await app.close();
  });
});
