import { describe, expect, it, vi } from 'vitest';
import { makeSupabaseEmployeeRepository } from '../src/employee/supabase-repository.js';
import type { ActivateCaseInput, AtomicChecklistMutationInput } from '../src/employee/checklist-service.js';

const checklistItem = {
  id: 'item-a',
  case_id: 'case-a',
  key: 'documents',
  title: 'Collect documents',
  description: 'Identity documents',
  state: 'completed',
  due_at: null,
  completed_at: '2026-09-28T12:00:00.000Z',
  sort_order: 1,
  created_at: '2026-09-28T00:00:00.000Z',
  updated_at: '2026-09-28T12:00:00.000Z',
};

describe('Supabase employee repository', () => {
  it('keeps the activation RPC contract compatible while forwarding server defaults', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        relocation_case: {
          id: 'case-a', tenant_id: 'tenant-a', employee_user_id: 'employee-a', destination_city_id: 'city-a',
          move_date: '2026-10-15', status: 'active', progress_percent: 0,
          created_at: '2026-09-28T00:00:00.000Z', updated_at: '2026-09-28T12:00:00.000Z',
        },
        checklist: [],
      },
      error: null,
    });
    const repository = makeSupabaseEmployeeRepository({ rpc } as never);
    const input: ActivateCaseInput = {
      userId: 'employee-a',
      tenantId: 'tenant-a',
      defaults: [{ key: 'caller-supplied', title: 'Ignored by SQL policy', description: null, due_at: null, sort_order: 99 }],
      traceId: 'request-activation',
    };

    await expect(repository.activateCase?.(input)).resolves.toMatchObject({
      relocationCase: { id: 'case-a' },
      checklist: [],
    });
    expect(rpc).toHaveBeenCalledWith('employee_activate_relocation_case', {
      p_user_id: 'employee-a',
      p_tenant_id: 'tenant-a',
      p_defaults: input.defaults,
      p_trace_id: 'request-activation',
    });
  });

  it('uses the authenticated RPC for atomic checklist mutation and maps its safe response', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { checklist_item: checklistItem }, error: null });
    const repository = makeSupabaseEmployeeRepository({ rpc } as never);
    const input: AtomicChecklistMutationInput = {
      userId: 'employee-a',
      tenantId: 'tenant-a',
      caseId: 'case-a',
      itemId: 'item-a',
      state: 'completed',
      idempotencyKey: 'check-atomic',
      requestHash: 'a'.repeat(64),
      traceId: 'request-1',
    };

    await expect(repository.setChecklistStateAtomic?.(input)).resolves.toEqual(checklistItem);
    expect(rpc).toHaveBeenCalledWith('employee_set_checklist_item_state', {
      p_user_id: 'employee-a',
      p_tenant_id: 'tenant-a',
      p_case_id: 'case-a',
      p_item_id: 'item-a',
      p_state: 'completed',
      p_idempotency_key: 'check-atomic',
      p_request_hash: 'a'.repeat(64),
      p_trace_id: 'request-1',
    });
  });

  it('normalizes database errors without exposing SQL or provider details', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'secret SQL detail' },
    });
    const repository = makeSupabaseEmployeeRepository({ rpc } as never);

    await expect(repository.setChecklistStateAtomic?.({
      userId: 'employee-a', tenantId: 'tenant-a', caseId: 'case-a', itemId: 'item-a',
      state: 'completed', idempotencyKey: 'check-errors', requestHash: 'b'.repeat(64), traceId: 'request-2',
    })).rejects.toMatchObject({
      code: 'EMPLOYEE_DATA_UNAVAILABLE',
      message: 'Employee relocation data is unavailable.',
    });
  });
});
