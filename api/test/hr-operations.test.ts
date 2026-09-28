import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';
import { makeProgramService, type ProgramRepository, type ProgramView } from '../src/hr/program-service.js';
import { makeRequestOperationsService, type RequestOperationsRepository, type RequestOperationsView } from '../src/hr/request-operations-service.js';
import { makeHrSettingsService, type HrSettingsRepository, type HrSettingsView } from '../src/hr/settings-service.js';

const membership: MembershipView = {
  id: 'membership-hr', tenant_id: 'tenant-a', user_id: 'hr-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-hr', key: 'hr' }],
};
const hr: IdentityContext = { user: { id: 'hr-a', email: 'hr@example.com' }, memberships: [membership] };

function program(overrides: Partial<ProgramView> = {}): ProgramView {
  return { id: 'program-1', tenantId: 'tenant-a', name: 'October cohort', destinationCityId: 'city-blr', status: 'draft', startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-12-31T23:59:59.000Z', createdBy: 'hr-a', createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', ...overrides };
}

function request(overrides: Partial<RequestOperationsView> = {}): RequestOperationsView {
  return { id: 'request-1', tenantId: 'tenant-a', employeeUserId: 'employee-a', directoryEntryId: 'entry-1', entryTitle: 'Bengaluru housing guide', providerName: 'Safe Homes', status: 'submitted', submittedAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z', ...overrides };
}

class InMemoryOperationsRepository implements ProgramRepository, RequestOperationsRepository, HrSettingsRepository {
  programs: ProgramView[] = [program()];
  requests: RequestOperationsView[] = [request()];
  settings: HrSettingsView = { timezone: 'Asia/Kolkata', channels: { email: true, inApp: true }, defaultProgramStatus: 'draft', updatedAt: '2026-09-29T00:00:00.000Z' };
  async listPrograms() { return { items: this.programs, total: this.programs.length }; }
  async createProgram(input: Parameters<NonNullable<ProgramRepository['createProgram']>>[0]) { const result = program({ id: `program-${this.programs.length + 1}`, name: input.name, destinationCityId: input.destinationCityId, startsAt: input.startsAt, endsAt: input.endsAt, createdBy: input.createdBy, tenantId: input.tenantId }); this.programs.push(result); return result; }
  async updateProgram(tenantId: string, id: string, patch: Parameters<NonNullable<ProgramRepository['updateProgram']>>[2]) { const current = this.programs.find((item) => item.id === id && item.tenantId === tenantId); return current ? { ...current, ...patch, updatedAt: '2026-09-29T12:00:00.000Z' } : null; }
  async listRequests() { return { items: this.requests, total: this.requests.length }; }
  async getRequest(tenantId: string, id: string) { return this.requests.find((item) => item.tenantId === tenantId && item.id === id) ?? null; }
  async updateRequestStatus(tenantId: string, id: string, status: RequestOperationsView['status']) { const current = await this.getRequest(tenantId, id); return current ? { ...current, status, updatedAt: '2026-09-29T12:00:00.000Z' } : null; }
  async getSettings() { return this.settings; }
  async updateSettings(_tenantId: string, _actorUserId: string, patch: Parameters<NonNullable<HrSettingsRepository['updateSettings']>>[2]) { this.settings = { ...this.settings, ...patch, channels: { ...this.settings.channels, ...(patch.channels ?? {}) }, updatedAt: '2026-09-29T12:00:00.000Z' }; return this.settings; }
}

function authServiceFor(identity = hr): AuthService {
  return {
    requestEmailOtp: async () => ({ accepted: true }), verifyEmailOtp: async () => { throw new Error('unused'); },
    getGoogleSignInUrl: async () => 'https://accounts.google.com', getCurrentIdentity: async () => identity,
    logout: async () => ({ signedOut: true }),
  };
}

describe('HR programmes and request operations', () => {
  it('rejects an invalid programme date range', async () => {
    const service = makeProgramService({ repository: new InMemoryOperationsRepository() });
    await expect(service.createProgram(hr, { name: 'Invalid', destinationCityId: 'city-blr', startsAt: '2026-10-10', endsAt: '2026-10-01' }, 'program-0001'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('creates a tenant programme and prevents cross-tenant updates', async () => {
    const repository = new InMemoryOperationsRepository();
    const service = makeProgramService({ repository });
    const result = await service.createProgram(hr, { name: 'November cohort', destinationCityId: 'city-blr', startsAt: '2026-11-01', endsAt: '2026-12-01' }, 'program-0001');
    expect(result.tenantId).toBe('tenant-a');
    await expect(service.updateProgram(hr, 'missing', { status: 'active' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('allows only valid provider request transitions', async () => {
    const repository = new InMemoryOperationsRepository();
    const service = makeRequestOperationsService({ repository });
    const result = await service.updateRequestStatus(hr, 'request-1', 'in_review');
    expect(result.status).toBe('in_review');
    await expect(service.updateRequestStatus(hr, 'request-1', 'completed')).rejects.toMatchObject({ code: 'INVALID_REQUEST_TRANSITION' });
  });

  it('updates tenant settings without changing the other values', async () => {
    const repository = new InMemoryOperationsRepository();
    const service = makeHrSettingsService({ repository });
    const result = await service.updateHrSettings(hr, { channels: { email: false } });
    expect(result.channels).toEqual({ email: false, inApp: true });
    expect(result.defaultProgramStatus).toBe('draft');
  });
});

describe('HR operations routes', () => {
  it('registers programmes, request operations, and settings routes', async () => {
    const repository = new InMemoryOperationsRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), hrOperationsRepository: repository });
    const programs = await app.inject({ method: 'GET', url: '/api/v1/hr/programs', headers: { authorization: 'Bearer hr-token' } });
    expect(programs.statusCode).toBe(200);
    const requests = await app.inject({ method: 'GET', url: '/api/v1/hr/provider-requests', headers: { authorization: 'Bearer hr-token' } });
    expect(requests.statusCode).toBe(200);
    const settings = await app.inject({ method: 'GET', url: '/api/v1/hr/settings', headers: { authorization: 'Bearer hr-token' } });
    expect(settings.statusCode).toBe(200);
    await app.close();
  });
});
