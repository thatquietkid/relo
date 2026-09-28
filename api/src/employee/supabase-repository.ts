import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import { ApiError } from '../shared/errors.js';
import type {
  ActivateCaseInput,
  AtomicChecklistMutationInput,
  EmployeeRepository,
  EmployeeRepositoryTransaction,
  EmployeeEvent,
  IdempotencyRecord,
  RelocationActivationResult,
} from './checklist-service.js';
import type { ChecklistItemRow, ChecklistItemView, RelocationCaseRow } from './types.js';

function repositoryError(): ApiError {
  return new ApiError(503, 'EMPLOYEE_DATA_UNAVAILABLE', 'Employee relocation data is unavailable.');
}

function mapCase(value: unknown): RelocationCaseRow {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    employee_user_id: String(row.employee_user_id),
    destination_city_id: String(row.destination_city_id),
    move_date: String(row.move_date),
    status: row.status as RelocationCaseRow['status'],
    progress_percent: Number(row.progress_percent),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapItem(value: unknown): ChecklistItemRow {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return {
    id: String(row.id),
    case_id: String(row.case_id),
    key: String(row.key),
    title: String(row.title),
    description: typeof row.description === 'string' ? row.description : null,
    state: row.state as ChecklistItemRow['state'],
    due_at: typeof row.due_at === 'string' ? row.due_at : null,
    completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    sort_order: Number(row.sort_order),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapError(error: unknown): ApiError {
  const value = error as { message?: unknown; code?: unknown };
  const message = typeof value?.message === 'string' ? value.message : '';
  if (message.includes('VALIDATION_ERROR')) {
    return new ApiError(400, 'VALIDATION_ERROR', 'The checklist state is invalid.');
  }
  if (message.includes('IDEMPOTENCY_KEY_CONFLICT')) {
    return new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'The idempotency key was used for a different mutation.');
  }
  if (message.includes('INVALID_CHECKLIST_STATE_TRANSITION')) {
    return new ApiError(409, 'INVALID_CHECKLIST_STATE_TRANSITION', 'The checklist state transition is invalid.');
  }
  if (message.includes('CHECKLIST_COMPLETION_TIMESTAMP')) {
    return new ApiError(409, 'INVALID_CHECKLIST_STATE_TRANSITION', 'The checklist state transition is invalid.');
  }
  if (message.includes('EMPLOYEE_ACCESS_DENIED')) {
    return new ApiError(403, 'FORBIDDEN', 'You do not have access to this relocation case.');
  }
  if (message.includes('MEMBERSHIP_REQUIRED')) {
    return new ApiError(403, 'MEMBERSHIP_REQUIRED', 'An active tenant membership is required.');
  }
  if (message.includes('CHECKLIST_ITEM_NOT_FOUND') || message.includes('RELOCATION_CASE_NOT_FOUND')) {
    return new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  void value?.code;
  return repositoryError();
}

export function makeSupabaseEmployeeRepository(client: ReturnType<typeof createSupabaseClient>): EmployeeRepository {
  const repository: EmployeeRepository = {
    async withTransaction<T>(work: (transaction: EmployeeRepositoryTransaction) => Promise<T>): Promise<T> {
      // Do not pretend that a client-side callback is a database transaction.
      void work;
      throw repositoryError();
    },

    async getCaseForEmployee(userId, tenantId) {
      const result = await client
        .from('relocation_cases')
        .select('id, tenant_id, employee_user_id, destination_city_id, move_date, status, progress_percent, created_at, updated_at')
        .eq('employee_user_id', userId)
        .eq('tenant_id', tenantId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw mapError(result.error);
      return result.data ? mapCase(result.data) : null;
    },

    async getCaseById(caseId) {
      const result = await client
        .from('relocation_cases')
        .select('id, tenant_id, employee_user_id, destination_city_id, move_date, status, progress_percent, created_at, updated_at')
        .eq('id', caseId)
        .maybeSingle();
      if (result.error) throw mapError(result.error);
      return result.data ? mapCase(result.data) : null;
    },

    async listChecklist(caseId) {
      const result = await client
        .from('checklist_items')
        .select('id, case_id, key, title, description, state, due_at, completed_at, sort_order, created_at, updated_at')
        .eq('case_id', caseId)
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });
      if (result.error) throw mapError(result.error);
      return (result.data ?? []).map(mapItem);
    },

    async getChecklistItem(caseId, itemId) {
      const result = await client
        .from('checklist_items')
        .select('id, case_id, key, title, description, state, due_at, completed_at, sort_order, created_at, updated_at')
        .eq('case_id', caseId)
        .eq('id', itemId)
        .maybeSingle();
      if (result.error) throw mapError(result.error);
      return result.data ? mapItem(result.data) : null;
    },

    async updateChecklistItem() {
      throw repositoryError();
    },

    async updateCaseProgress() {
      throw repositoryError();
    },

    async findIdempotency(tenantId, actorUserId, key) {
      const result = await client
        .from('idempotency_keys')
        .select('tenant_id, actor_user_id, key, request_hash, response_body, expires_at')
        .eq('tenant_id', tenantId)
        .eq('actor_user_id', actorUserId)
        .eq('key', key)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (result.error) throw mapError(result.error);
      if (!result.data) return null;
      const response = result.data.response_body as Record<string, unknown>;
      return {
        tenantId: String(result.data.tenant_id),
        actorUserId: String(result.data.actor_user_id),
        key: String(result.data.key),
        requestHash: String(result.data.request_hash),
        expiresAt: String(result.data.expires_at),
        response: mapItem(response.checklist_item ?? response),
      } satisfies IdempotencyRecord;
    },

    async saveIdempotency() {
      throw repositoryError();
    },

    async appendEvent(_event: EmployeeEvent) {
      throw repositoryError();
    },

    async activateCase(input: ActivateCaseInput): Promise<RelocationActivationResult> {
      const result = await client.rpc('employee_activate_relocation_case', {
        p_user_id: input.userId,
        p_tenant_id: input.tenantId,
        p_defaults: input.defaults,
        p_trace_id: input.traceId,
      });
      if (result.error) throw mapError(result.error);
      const value = result.data as { relocation_case?: unknown; checklist?: unknown[] } | null;
      if (!value?.relocation_case || !Array.isArray(value.checklist)) throw repositoryError();
      return {
        relocationCase: mapCase(value.relocation_case),
        checklist: value.checklist.map(mapItem),
      };
    },

    async setChecklistStateAtomic(input: AtomicChecklistMutationInput): Promise<ChecklistItemView> {
      const result = await client.rpc('employee_set_checklist_item_state', {
        p_user_id: input.userId,
        p_tenant_id: input.tenantId,
        p_case_id: input.caseId,
        p_item_id: input.itemId,
        p_state: input.state,
        p_idempotency_key: input.idempotencyKey,
        p_request_hash: input.requestHash,
        p_trace_id: input.traceId,
      });
      if (result.error) throw mapError(result.error);
      const value = result.data as { checklist_item?: unknown } | null;
      return mapItem(value?.checklist_item ?? value);
    },
  };

  return repository;
}

export function createSupabaseEmployeeRepositoryFromEnv(accessToken: string): EmployeeRepository {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = accessToken.trim();
  if (!url || !publishableKey || !token) throw repositoryError();
  // This request-scoped client uses the caller's JWT. A service-role key is
  // intentionally not read here because it would bypass employee RLS.
  const config: SupabaseClientConfig = { url, publishableKey, accessToken: token };
  return makeSupabaseEmployeeRepository(createSupabaseClient(config));
}
