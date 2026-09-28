import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';
import { makeHrService, type EmployeeSummary, type HrRepository, type InvitationRecord } from '../src/hr/invitation-service.js';

const membership: MembershipView = {
  id: 'membership-hr', tenant_id: 'tenant-a', user_id: 'hr-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-hr', key: 'hr' }],
};
const hr: IdentityContext = { user: { id: 'hr-a', email: 'hr@example.com' }, memberships: [membership] };

function invitation(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  return {
    id: 'invitation-1', tenantId: 'tenant-a', email: 'new@example.com', roleKey: 'employee', status: 'pending',
    expiresAt: '2026-10-06T00:00:00.000Z', acceptedAt: null, invitedBy: 'hr-a', createdAt: '2026-09-29T00:00:00.000Z',
    ...overrides,
  };
}

class InMemoryHrRepository implements HrRepository {
  employees: EmployeeSummary[] = [{ membershipId: 'membership-employee', userId: 'employee-a', email: 'employee@example.com', name: 'Employee A', status: 'active', joinedAt: '2026-09-01T00:00:00.000Z', roles: ['employee'] }];
  invitations: InvitationRecord[] = [];
  resendCount = 0;

  async listEmployees() { return { items: this.employees, total: this.employees.length }; }
  async findActiveInvitation(tenantId: string, email: string) { return this.invitations.find((item) => item.tenantId === tenantId && item.email === email && item.status === 'pending') ?? null; }
  async createInvitation(input: Parameters<NonNullable<HrRepository['createInvitation']>>[0]) {
    const record = invitation({ id: `invitation-${this.invitations.length + 1}`, tenantId: input.tenantId, email: input.email, invitedBy: input.invitedBy, expiresAt: input.expiresAt });
    this.invitations.push(record);
    return record;
  }
  async getInvitation(tenantId: string, id: string) { return this.invitations.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async resendInvitation(input: Parameters<NonNullable<HrRepository['resendInvitation']>>[0]) {
    this.resendCount += 1;
    const existing = await this.getInvitation(input.tenantId, input.id);
    return existing ? { ...existing, expiresAt: input.expiresAt } : null;
  }
  async revokeInvitation(tenantId: string, id: string) { const item = await this.getInvitation(tenantId, id); return item ? { ...item, status: 'revoked' as const } : null; }
}

function authServiceFor(identity = hr): AuthService {
  return {
    requestEmailOtp: async () => ({ accepted: true }), verifyEmailOtp: async () => { throw new Error('unused'); },
    getGoogleSignInUrl: async () => 'https://accounts.google.com', getCurrentIdentity: async () => identity,
    logout: async () => ({ signedOut: true }),
  };
}

describe('HR employee invitations', () => {
  it('creates only employee invitations from HR', async () => {
    const repository = new InMemoryHrRepository();
    const service = makeHrService({ repository, now: () => new Date('2026-09-29T12:00:00.000Z') });
    const result = await service.createEmployeeInvitation(hr, { email: 'New@Example.com', name: 'New Person' }, 'invite-0001');
    expect(result.role).toBe('employee');
    expect(result.email).toBe('new@example.com');
    await expect(service.createEmployeeInvitation(hr, { email: 'admin@example.com', role: 'admin' }, 'invite-0002'))
      .rejects.toMatchObject({ code: 'ROLE_NOT_ALLOWED' });
  });

  it('rejects duplicate active invitations and supports revoke', async () => {
    const repository = new InMemoryHrRepository();
    const service = makeHrService({ repository });
    await service.createEmployeeInvitation(hr, { email: 'new@example.com' }, 'invite-0001');
    await expect(service.createEmployeeInvitation(hr, { email: 'new@example.com' }, 'invite-0002'))
      .rejects.toMatchObject({ code: 'INVITATION_ALREADY_PENDING' });
    const result = await service.revokeEmployeeInvitation(hr, 'invitation-1');
    expect(result.status).toBe('revoked');
  });

  it('rejects cross-tenant invitation access', async () => {
    const repository = new InMemoryHrRepository();
    repository.invitations.push(invitation({ tenantId: 'tenant-b' }));
    const service = makeHrService({ repository });
    await expect(service.revokeEmployeeInvitation(hr, 'invitation-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists only tenant employee summaries', async () => {
    const service = makeHrService({ repository: new InMemoryHrRepository() });
    const result = await service.listTenantEmployees(hr, { page: 1, pageSize: 20 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('tokenHash');
  });
});

describe('HR invitation routes', () => {
  it('registers employee and invitation routes behind HR authorization', async () => {
    const repository = new InMemoryHrRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), hrRepository: repository });
    const list = await app.inject({ method: 'GET', url: '/api/v1/hr/employees', headers: { authorization: 'Bearer hr-token' } });
    expect(list.statusCode).toBe(200);
    const create = await app.inject({ method: 'POST', url: '/api/v1/hr/invitations', headers: { authorization: 'Bearer hr-token', 'idempotency-key': 'invite-route-1' }, payload: { email: 'new@example.com' } });
    expect(create.statusCode).toBe(201);
    expect(create.json().invitation.role).toBe('employee');
    await app.close();
  });
});
