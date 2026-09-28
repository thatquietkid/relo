import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { makeRequestService, type ProviderRequestRepository, type ProviderRequestView, type RequestEntryRecord, type RequestEvent, type RequestInput, type RelocationCaseContext } from '../src/requests/request-service.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';

const now = new Date('2026-09-29T12:00:00.000Z');
const membership: MembershipView = {
  id: 'membership-a', tenant_id: 'tenant-a', user_id: 'employee-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-employee', key: 'employee' }],
};
const employee: IdentityContext = {
  user: { id: 'employee-a', email: 'employee@example.com' },
  memberships: [membership],
};

function entry(overrides: Partial<RequestEntryRecord> = {}): RequestEntryRecord {
  return {
    id: 'entry-1', cityId: 'city-blr', cityName: 'Bengaluru', category: 'housing',
    providerName: 'Safe Homes', providerSummary: 'Trusted housing support.',
    title: 'Bengaluru housing guide', description: 'A practical guide for finding a home.',
    sourceUrl: 'https://directory.example/housing', contactPolicy: 'employee_request',
    publishedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-10-01T00:00:00.000Z', status: 'published',
    ...overrides,
  };
}

function relocation(overrides: Partial<RelocationCaseContext> = {}): RelocationCaseContext {
  return { id: 'case-1', tenantId: 'tenant-a', employeeUserId: 'employee-a', destinationCityId: 'city-blr', destinationCityName: 'Bengaluru', moveDate: '2026-11-15', status: 'active', ...overrides };
}

class InMemoryProviderRequestRepository implements ProviderRequestRepository {
  entries = [entry(), entry({ id: 'entry-expired', expiresAt: '2026-09-28T00:00:00.000Z' }), entry({ id: 'entry-other', title: 'Another Bengaluru provider' }), entry({ id: 'entry-del', cityId: 'city-del', cityName: 'Delhi' })];
  cases = [relocation()];
  requests: ProviderRequestView[] = [];
  events: RequestEvent[] = [];
  idempotency = new Map<string, { hash: string; requestId: string }>();

  async getCase(userId: string, tenantId: string): Promise<RelocationCaseContext | null> { return this.cases.find((value) => value.employeeUserId === userId && value.tenantId === tenantId) ?? null; }
  async getEntry(entryId: string): Promise<RequestEntryRecord | null> { return this.entries.find((value) => value.id === entryId) ?? null; }
  async listRequests(userId: string, tenantId: string): Promise<ProviderRequestView[]> { return this.requests.filter((value) => value.userId === userId && value.tenantId === tenantId); }
  async submitRequest(input: Parameters<ProviderRequestRepository['submitRequest']>[0]) {
    const key = `${input.tenantId}:${input.userId}:${input.idempotencyKey}`;
    const prior = this.idempotency.get(key);
    if (prior && prior.hash !== input.requestHash) throw Object.assign(new Error('IDEMPOTENCY_KEY_CONFLICT'), { code: 'IDEMPOTENCY_KEY_CONFLICT' });
    if (prior) return this.requests.find((value) => value.id === prior.requestId)!;
    const active = this.requests.find((value) => value.caseId === input.caseId && value.entryId === input.entryId && value.status !== 'withdrawn');
    if (active) throw Object.assign(new Error('REQUEST_ALREADY_EXISTS'), { code: 'REQUEST_ALREADY_EXISTS' });
    const request = this.makeRequest(input);
    this.requests.push(request);
    this.idempotency.set(key, { hash: input.requestHash, requestId: request.id });
    this.events.push(event('ProviderRequestSubmitted', request.id, input.tenantId, input.userId));
    return request;
  }
  async withdrawRequest(input: Parameters<ProviderRequestRepository['withdrawRequest']>[0]) {
    const request = this.requests.find((value) => value.id === input.requestId && value.userId === input.userId && value.tenantId === input.tenantId);
    if (!request) return null;
    if (request.status === 'withdrawn') return request;
    request.status = 'withdrawn';
    request.withdrawnAt = now.toISOString();
    this.events.push(event('ConsentWithdrawn', request.id, input.tenantId, input.userId));
    this.events.push(event('ProviderRequestWithdrawn', request.id, input.tenantId, input.userId));
    return request;
  }
  private makeRequest(input: Parameters<ProviderRequestRepository['submitRequest']>[0]): ProviderRequestView {
    return {
      id: `request-${this.requests.length + 1}`, userId: input.userId, tenantId: input.tenantId, caseId: input.caseId,
      entryId: input.entryId, status: 'submitted' as const, submittedAt: now.toISOString(), withdrawnAt: null,
      createdAt: now.toISOString(), updatedAt: now.toISOString(), entry: this.entries.find((value) => value.id === input.entryId)!,
    };
  }
}

function event(type: RequestEvent['type'], requestId: string, tenantId: string, actorId: string): RequestEvent {
  return { id: `${type}-${requestId}`, type, version: 1, occurredAt: now.toISOString(), tenantId, actorId, traceId: `trace-${requestId}`, requestId, payload: { requestId } };
}

function validInput(): RequestInput { return { entryId: 'entry-1', consents: [
  { field: 'email', consented: true }, { field: 'destination_city', consented: true }, { field: 'move_date', consented: true },
] }; }

function authServiceFor(identity = employee): AuthService {
  return {
    requestEmailOtp: async () => ({ accepted: true }), verifyEmailOtp: async () => { throw new Error('unused'); },
    getGoogleSignInUrl: async () => 'https://accounts.google.com', getCurrentIdentity: async () => identity,
    logout: async () => ({ signedOut: true }),
  };
}

describe('consent-based provider requests', () => {
  it('returns a safe preview with destination and explicit fields', async () => {
    const service = makeRequestService({ repository: new InMemoryProviderRequestRepository(), now: () => now });
    const preview = await service.previewRequest(employee, 'entry-1');
    expect(preview.destination).toEqual({ cityId: 'city-blr', cityName: 'Bengaluru', moveDate: '2026-11-15' });
    expect(preview.fields.map((field) => field.field)).toEqual(['email', 'destination_city', 'move_date']);
    expect(preview).not.toHaveProperty('providerEmail');
    expect(preview).not.toHaveProperty('providerPhone');
  });

  it('requires all field-level consent before submission', async () => {
    const service = makeRequestService({ repository: new InMemoryProviderRequestRepository(), now: () => now });
    await expect(service.submitRequest(employee, { ...validInput(), consents: [{ field: 'email', consented: false }] }, 'request-001'))
      .rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('rejects unpublished, expired, and wrong-destination entries', async () => {
    const repository = new InMemoryProviderRequestRepository();
    const service = makeRequestService({ repository, now: () => now });
    await expect(service.previewRequest(employee, 'entry-expired')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.previewRequest(employee, 'entry-del')).rejects.toMatchObject({ code: 'DIRECTORY_CITY_FORBIDDEN' });
  });

  it('requires an active relocation case before submission', async () => {
    const repository = new InMemoryProviderRequestRepository();
    repository.cases[0].status = 'draft';
    const service = makeRequestService({ repository, now: () => now });
    await expect(service.previewRequest(employee, 'entry-1')).rejects.toMatchObject({ code: 'CASE_NOT_ACTIVE' });
  });

  it('makes repeated submissions idempotent and emits one submission event', async () => {
    const repository = new InMemoryProviderRequestRepository();
    const service = makeRequestService({ repository, now: () => now });
    const first = await service.submitRequest(employee, validInput(), 'request-001');
    const second = await service.submitRequest(employee, validInput(), 'request-001');
    expect(second.id).toBe(first.id);
    expect(repository.events.filter((event) => event.type === 'ProviderRequestSubmitted')).toHaveLength(1);
    await expect(service.submitRequest(employee, { ...validInput(), entryId: 'entry-other' }, 'request-001')).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('withdraws without deleting history and emits each withdrawal audit event once', async () => {
    const repository = new InMemoryProviderRequestRepository();
    const service = makeRequestService({ repository, now: () => now });
    const created = await service.submitRequest(employee, validInput(), 'request-001');
    const withdrawn = await service.withdrawRequest(employee, created.id);
    await service.withdrawRequest(employee, created.id);
    expect(withdrawn.status).toBe('withdrawn');
    expect(await service.listRequests(employee)).toHaveLength(1);
    expect(repository.events.filter((event) => event.type === 'ConsentWithdrawn')).toHaveLength(1);
    expect(repository.events.filter((event) => event.type === 'ProviderRequestWithdrawn')).toHaveLength(1);
  });

  it('keeps requests private to the owning employee', async () => {
    const repository = new InMemoryProviderRequestRepository();
    const service = makeRequestService({ repository, now: () => now });
    const other = { ...employee, user: { id: 'employee-b', email: 'other@example.com' }, memberships: [{ ...membership, user_id: 'employee-b' }] };
    const created = await service.submitRequest(employee, validInput(), 'request-001');
    await expect(service.withdrawRequest(other, created.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.listRequests(other)).resolves.toEqual([]);
  });
});

describe('provider request routes', () => {
  it('registers preview, list, submit, and withdraw routes', async () => {
    const repository = new InMemoryProviderRequestRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), providerRequestRepository: repository });
    const preview = await app.inject({ method: 'POST', url: '/api/v1/me/provider-requests/preview', headers: { authorization: 'Bearer employee-token' }, payload: { entryId: 'entry-1' } });
    expect(preview.statusCode).toBe(200);
    const invalid = await app.inject({ method: 'POST', url: '/api/v1/me/provider-requests', headers: { authorization: 'Bearer employee-token' }, payload: validInput() });
    expect(invalid.statusCode).toBe(400);
    const submitted = await app.inject({ method: 'POST', url: '/api/v1/me/provider-requests', headers: { authorization: 'Bearer employee-token', 'idempotency-key': 'request-001' }, payload: validInput() });
    expect(submitted.statusCode).toBe(200);
    const listed = await app.inject({ method: 'GET', url: '/api/v1/me/provider-requests', headers: { authorization: 'Bearer employee-token' } });
    expect(listed.statusCode).toBe(200);
    const withdrawn = await app.inject({ method: 'POST', url: `/api/v1/me/provider-requests/${submitted.json().request.id}/withdraw`, headers: { authorization: 'Bearer employee-token' } });
    expect(withdrawn.statusCode).toBe(200);
    await app.close();
  });
});
