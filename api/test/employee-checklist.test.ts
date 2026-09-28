import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { DEFAULT_CHECKLIST_ITEMS, makeCaseService } from '../src/employee/case-service.js';
import {
  type ActivateCaseInput,
  type AtomicChecklistMutationInput,
  makeChecklistService,
  type RelocationActivationResult,
  type EmployeeRepository,
  type EmployeeRepositoryTransaction,
  type EmployeeEvent,
  type IdempotencyRecord,
} from '../src/employee/checklist-service.js';
import type {
  ChecklistItemRow,
  ChecklistItemState,
  RelocationCaseRow,
} from '../src/employee/types.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';

const timestamps = {
  created: '2026-09-28T00:00:00.000Z',
  updated: '2026-09-28T00:00:00.000Z',
};

function membership(userId: string, tenantId: string): MembershipView {
  return {
    id: `membership-${userId}`,
    tenant_id: tenantId,
    user_id: userId,
    status: 'active',
    joined_at: timestamps.created,
    suspended_at: null,
    tenant: { id: tenantId, name: 'Acme', slug: 'acme', status: 'active' },
    roles: [{ id: 'role-employee', key: 'employee' }],
  };
}

function identity(userId = 'employee-a', tenantId = 'tenant-a'): IdentityContext {
  return {
    user: { id: userId, email: `${userId}@example.com` },
    memberships: [membership(userId, tenantId)],
  };
}

function relocationCase(overrides: Partial<RelocationCaseRow> = {}): RelocationCaseRow {
  return {
    id: 'case-a',
    tenant_id: 'tenant-a',
    employee_user_id: 'employee-a',
    destination_city_id: 'city-bengaluru',
    move_date: '2026-11-15',
    status: 'active',
    progress_percent: 99,
    created_at: timestamps.created,
    updated_at: timestamps.updated,
    ...overrides,
  };
}

function checklistItem(overrides: Partial<ChecklistItemRow> = {}): ChecklistItemRow {
  return {
    id: 'item-a',
    case_id: 'case-a',
    key: 'documents',
    title: 'Collect documents',
    description: 'Identity documents',
    state: 'pending',
    due_at: '2026-10-05T00:00:00.000Z',
    completed_at: null,
    sort_order: 1,
    created_at: timestamps.created,
    updated_at: timestamps.updated,
    ...overrides,
  };
}

class InMemoryEmployeeRepository implements EmployeeRepository {
  cases: RelocationCaseRow[];
  items: ChecklistItemRow[];
  idempotency = new Map<string, IdempotencyRecord>();
  events: EmployeeEvent[] = [];
  setChecklistStateAtomic?: EmployeeRepository['setChecklistStateAtomic'];

  constructor(cases = [relocationCase()], items = [checklistItem()]) {
    this.cases = structuredClone(cases);
    this.items = structuredClone(items);
  }

  async withTransaction<T>(work: (transaction: EmployeeRepositoryTransaction) => Promise<T>): Promise<T> {
    return work(this);
  }

  async getCaseForEmployee(userId: string, tenantId: string): Promise<RelocationCaseRow | null> {
    return this.cases.find((row) => row.employee_user_id === userId && row.tenant_id === tenantId && row.status !== 'cancelled') ?? null;
  }

  async getCaseById(caseId: string): Promise<RelocationCaseRow | null> {
    return this.cases.find((row) => row.id === caseId && row.status !== 'cancelled') ?? null;
  }

  async listChecklist(caseId: string): Promise<ChecklistItemRow[]> {
    return this.items.filter((item) => item.case_id === caseId).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
  }

  async getChecklistItem(caseId: string, itemId: string): Promise<ChecklistItemRow | null> {
    return this.items.find((item) => item.case_id === caseId && item.id === itemId) ?? null;
  }

  async updateChecklistItem(itemId: string, patch: Pick<ChecklistItemRow, 'state' | 'completed_at' | 'updated_at'>): Promise<ChecklistItemRow> {
    const item = this.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error('item missing');
    Object.assign(item, patch);
    return structuredClone(item);
  }

  async updateCaseProgress(caseId: string, progressPercent: number): Promise<RelocationCaseRow> {
    const row = this.cases.find((candidate) => candidate.id === caseId);
    if (!row) throw new Error('case missing');
    row.progress_percent = progressPercent;
    row.updated_at = timestamps.updated;
    return structuredClone(row);
  }

  async findIdempotency(tenantId: string, actorUserId: string, key: string): Promise<IdempotencyRecord | null> {
    const record = this.idempotency.get(`${tenantId}:${actorUserId}:${key}`) ?? null;
    if (record?.expiresAt && record.expiresAt <= timestamps.updated) return null;
    return record;
  }

  async saveIdempotency(record: IdempotencyRecord): Promise<void> {
    this.idempotency.set(`${record.tenantId}:${record.actorUserId}:${record.key}`, structuredClone(record));
  }

  async appendEvent(event: EmployeeEvent): Promise<void> {
    this.events.push(structuredClone(event));
  }

  async activateCase(input: ActivateCaseInput): Promise<RelocationActivationResult> {
    const row = this.cases.find(
      (candidate) => candidate.employee_user_id === input.userId && candidate.tenant_id === input.tenantId,
    );
    if (!row) throw new Error('case missing');
    if (row.status === 'draft') {
      row.status = 'active';
      for (const item of input.defaults) {
        if (!this.items.some((candidate) => candidate.case_id === row.id && candidate.key === item.key)) {
          this.items.push({
            id: `generated-${item.key}`,
            case_id: row.id,
            key: item.key,
            title: item.title,
            description: item.description,
            state: 'pending',
            due_at: item.due_at,
            completed_at: null,
            sort_order: item.sort_order,
            created_at: timestamps.created,
            updated_at: timestamps.updated,
          });
        }
      }
      this.events.push({
        id: 'activation-event',
        type: 'RelocationCaseActivated',
        version: 1,
        occurredAt: timestamps.updated,
        tenantId: row.tenant_id,
        actorId: input.userId,
        traceId: input.traceId,
        payload: { tenant_id: row.tenant_id, case_id: row.id, employee_user_id: row.employee_user_id },
      });
    }
    return {
      relocationCase: structuredClone(row),
      checklist: structuredClone(this.items.filter((item) => item.case_id === row.id)),
    };
  }

  count(type: EmployeeEvent['type']): number {
    return this.events.filter((event) => event.type === type).length;
  }
}

function services(repository: InMemoryEmployeeRepository) {
  const now = () => new Date('2026-09-28T12:00:00.000Z');
  return {
    repository,
    caseService: makeCaseService({ repository }),
    checklistService: makeChecklistService({ repository, now }),
  };
}


describe('employee relocation case and checklist services', () => {
  it('activates a draft case once, generates defaults, and emits one activation event', async () => {
    const repository = new InMemoryEmployeeRepository([relocationCase({ status: 'draft' })], []);
    const { caseService } = services(repository);

    const first = await caseService.activateMyRelocationCase(identity(), 'activation-trace');
    const second = await caseService.activateMyRelocationCase(identity(), 'activation-trace');

    expect(first).toMatchObject({ id: 'case-a', status: 'active', progress_percent: 0 });
    expect(second).toEqual(first);
    expect(repository.items).toHaveLength(DEFAULT_CHECKLIST_ITEMS.length);
    expect(repository.count('RelocationCaseActivated')).toBe(1);
    expect(repository.events.find((event) => event.type === 'RelocationCaseActivated')).toEqual(expect.objectContaining({
      version: 1,
      occurredAt: timestamps.updated,
      tenantId: 'tenant-a',
      actorId: 'employee-a',
      traceId: 'activation-trace',
      payload: {
        tenant_id: 'tenant-a',
        case_id: 'case-a',
        employee_user_id: 'employee-a',
      },
    }));
  });

  it('reads the employee case and calculates progress from completed rows', async () => {
    const repository = new InMemoryEmployeeRepository(
      [relocationCase()],
      [
        checklistItem({ id: 'item-a', sort_order: 2 }),
        checklistItem({ id: 'item-b', key: 'housing', title: 'Compare housing', sort_order: 1, state: 'completed', completed_at: '2026-09-27T00:00:00.000Z' }),
        checklistItem({ id: 'item-c', key: 'school', title: 'Review schools', sort_order: 3 }),
        checklistItem({ id: 'item-d', key: 'banking', title: 'Set up banking', sort_order: 4 }),
      ],
    );
    const { caseService } = services(repository);

    await expect(caseService.getMyRelocationCase(identity())).resolves.toMatchObject({
      id: 'case-a',
      progress_percent: 25,
      status: 'active',
    });
  });

  it('rejects another employee case and distinguishes a missing case', async () => {
    const repository = new InMemoryEmployeeRepository();
    const { checklistService } = services(repository);

    await expect(checklistService.listChecklist(identity('employee-b', 'tenant-b'), 'case-a'))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(checklistService.listChecklist(identity(), 'missing-case'))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('lists only the requested case checklist in deterministic order', async () => {
    const repository = new InMemoryEmployeeRepository(undefined, [
      checklistItem({ id: 'item-z', sort_order: 2 }),
      checklistItem({ id: 'item-a', sort_order: 1 }),
      checklistItem({ id: 'other-case-item', case_id: 'other-case', sort_order: 0 }),
    ]);
    const { checklistService } = services(repository);

    await expect(checklistService.listChecklist(identity(), 'case-a')).resolves.toEqual([
      expect.objectContaining({ id: 'item-a' }),
      expect.objectContaining({ id: 'item-z' }),
    ]);
  });

  it('completes a checklist item once and emits one completion event', async () => {
    const repository = new InMemoryEmployeeRepository();
    const { checklistService } = services(repository);

    const first = await checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'completed', 'check-1', 'trace-complete');
    const second = await checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'completed', 'check-1', 'trace-complete');

    expect(second).toEqual(first);
    expect(first).toMatchObject({ state: 'completed', completed_at: '2026-09-28T12:00:00.000Z' });
    expect(repository.count('ChecklistItemCompleted')).toBe(1);
    expect(repository.events.find((event) => event.type === 'ChecklistItemCompleted')).toMatchObject({
      traceId: 'trace-complete',
      payload: { completed_at: '2026-09-28T12:00:00.000Z' },
    });
  });

  it('reclaims an expired idempotency key before applying a new mutation', async () => {
    const repository = new InMemoryEmployeeRepository();
    repository.idempotency.set('tenant-a:employee-a:check-expired', {
      tenantId: 'tenant-a',
      actorUserId: 'employee-a',
      key: 'check-expired',
      requestHash: 'expired-hash',
      expiresAt: '2026-09-27T00:00:00.000Z',
      response: checklistItem(),
    });
    const { checklistService } = services(repository);

    await expect(checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'completed', 'check-expired'))
      .resolves.toMatchObject({ state: 'completed' });
    expect(repository.count('ChecklistItemCompleted')).toBe(1);
  });

  it('reclaims an expired idempotency record returned by the repository', async () => {
    const repository = new InMemoryEmployeeRepository();
    const findIdempotency = vi.spyOn(repository, 'findIdempotency').mockResolvedValue({
      tenantId: 'tenant-a',
      actorUserId: 'employee-a',
      key: 'check-expired-from-repository',
      requestHash: 'expired-hash',
      expiresAt: '2026-09-28T11:59:59.999Z',
      response: checklistItem(),
    });
    const { checklistService } = services(repository);

    await expect(
      checklistService.setChecklistState(
        identity(),
        'case-a',
        'item-a',
        'completed',
        'check-expired-from-repository',
      ),
    ).resolves.toMatchObject({ state: 'completed' });
    expect(findIdempotency).toHaveBeenCalledOnce();
    expect(repository.count('ChecklistItemCompleted')).toBe(1);
  });

  it('rejects an idempotency key reused for a different mutation', async () => {
    const repository = new InMemoryEmployeeRepository();
    const { checklistService } = services(repository);

    await checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'completed', 'check-2');
    await expect(checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'in_progress', 'check-2'))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });

  it('rejects invalid states and invalid transitions', async () => {
    const repository = new InMemoryEmployeeRepository(undefined, [checklistItem({ state: 'completed', completed_at: timestamps.created })]);
    const { checklistService } = services(repository);

    await expect(checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'invalid' as ChecklistItemState, 'check-3'))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'skipped', 'check-4'))
      .rejects.toMatchObject({ code: 'INVALID_CHECKLIST_STATE_TRANSITION' });
  });

  it('reopens a completed item and clears completed_at', async () => {
    const repository = new InMemoryEmployeeRepository(undefined, [checklistItem({ state: 'completed', completed_at: timestamps.created })]);
    const { checklistService } = services(repository);

    await expect(checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'in_progress', 'check-5'))
      .resolves.toMatchObject({ state: 'in_progress', completed_at: null });
  });

  it('delegates mutations to the atomic repository hook with tenant, hash, and trace context', async () => {
    const repository = new InMemoryEmployeeRepository();
    let queue = Promise.resolve();
    let inFlight = 0;
    let maxInFlight = 0;
    const atomicMutation = vi.fn(async (input: AtomicChecklistMutationInput) => {
      const previous = queue;
      let release!: () => void;
      queue = new Promise<void>((resolve) => { release = resolve; });
      await previous;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      expect(input.userId).toBe('employee-a');
      expect(input.tenantId).toBe('tenant-a');
      expect(input.caseId).toBe('case-a');
      expect(input.itemId).toBe('item-a');
      expect(input.state).toBe('completed');
      expect(input.idempotencyKey).toBe('check-atomic');
      expect(input.requestHash).toMatch(/^[a-f0-9]{64}$/);
      expect(input.traceId).toBe('trace-atomic');
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      release();
      return checklistItem({ state: 'completed', completed_at: '2026-09-28T12:00:00.000Z' });
    });
    repository.setChecklistStateAtomic = atomicMutation;
    const transaction = vi.spyOn(repository, 'withTransaction');
    const { checklistService } = services(repository);

    const results = await Promise.all([
      checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'completed', 'check-atomic', 'trace-atomic'),
      checklistService.setChecklistState(identity(), 'case-a', 'item-a', 'completed', 'check-atomic', 'trace-atomic'),
    ]);

    expect(results[0]).toMatchObject({ state: 'completed', completed_at: '2026-09-28T12:00:00.000Z' });
    expect(results[1]).toEqual(results[0]);
    expect(atomicMutation).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('employee relocation checklist routes', () => {
  function authServiceFor(userId = 'employee-a', tenantId = 'tenant-a'): AuthService {
    return {
      requestEmailOtp: vi.fn(),
      verifyEmailOtp: vi.fn(),
      getGoogleSignInUrl: vi.fn(),
      getCurrentIdentity: vi.fn().mockResolvedValue(identity(userId, tenantId)),
      logout: vi.fn(),
    };
  }

  it('rejects protected relocation routes without a bearer session', async () => {
    const repository = new InMemoryEmployeeRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), employeeRepository: repository });

    const response = await app.inject({ method: 'GET', url: '/api/v1/me/relocation' });

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

  it('returns explicit relocation and checklist response shapes and normalizes errors', async () => {
    const repository = new InMemoryEmployeeRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), employeeRepository: repository });

    const relocation = await app.inject({
      method: 'GET',
      url: '/api/v1/me/relocation',
      headers: { authorization: 'Bearer employee-token' },
    });
    expect(relocation.statusCode).toBe(200);
    expect(relocation.json()).toEqual({ relocation: expect.objectContaining({ id: 'case-a', progress_percent: 0 }) });

    const checklist = await app.inject({
      method: 'GET',
      url: '/api/v1/me/relocation/checklist',
      headers: { authorization: 'Bearer employee-token' },
    });
    expect(checklist.statusCode).toBe(200);
    expect(checklist.json()).toEqual({ checklist: [expect.objectContaining({ id: 'item-a' })] });

    const invalid = await app.inject({
      method: 'PATCH',
      url: '/api/v1/me/relocation/checklist/item-a',
      headers: { authorization: 'Bearer employee-token', 'idempotency-key': 'check-route-1' },
      payload: { state: 'not-a-state' },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toMatchObject({ code: 'VALIDATION_ERROR', requestId: expect.any(String) });
    await app.close();
  });

  it('uses the server-side employee repository factory when no test repository is injected', async () => {
    const repository = new InMemoryEmployeeRepository();
    const createEmployeeRepository = vi.fn().mockReturnValue(repository);
    const app = createApp({ logger: false }, {
      authService: authServiceFor(),
      createEmployeeRepository,
    });

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/me/relocation',
      headers: { authorization: 'Bearer employee-token' },
    });

    expect(response.statusCode).toBe(200);
    expect(createEmployeeRepository).toHaveBeenCalledWith('employee-token');
    await app.close();
  });
});
