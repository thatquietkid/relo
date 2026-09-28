import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { makeSupabaseEmployeeRepository } from '../src/employee/supabase-repository.js';
import type { ActivateCaseInput } from '../src/employee/checklist-service.js';

const caseRow = {
  id: 'case-a',
  tenant_id: 'tenant-a',
  employee_user_id: 'employee-a',
  destination_city_id: 'city-a',
  move_date: '2026-10-15',
  status: 'active',
  progress_percent: 0,
  created_at: '2026-09-28T00:00:00.000Z',
  updated_at: '2026-09-28T12:00:00.000Z',
};

const item = {
  id: 'item-a',
  case_id: 'case-a',
  key: 'documents',
  title: 'Collect documents',
  description: 'Identity documents',
  state: 'pending',
  due_at: null,
  completed_at: null,
  sort_order: 1,
  created_at: '2026-09-28T00:00:00.000Z',
  updated_at: '2026-09-28T00:00:00.000Z',
};

describe('production employee data path', () => {
  it('maps the atomic activation RPC response and forwards only scoped inputs', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { relocation_case: caseRow, checklist: [item] },
      error: null,
    });
    const repository = makeSupabaseEmployeeRepository({ rpc } as never);
    const input: ActivateCaseInput = {
      userId: 'employee-a',
      tenantId: 'tenant-a',
      defaults: [{ key: 'documents', title: 'Collect documents', description: 'Identity documents', due_at: null, sort_order: 1 }],
      traceId: 'request-1',
    };

    await expect(repository.activateCase?.(input)).resolves.toEqual({
      relocationCase: caseRow,
      checklist: [item],
    });
    expect(rpc).toHaveBeenCalledWith('employee_activate_relocation_case', {
      p_user_id: 'employee-a',
      p_tenant_id: 'tenant-a',
      p_defaults: input.defaults,
      p_trace_id: 'request-1',
    });
  });

  it('keeps the employee RPC migration on a fixed empty search path', () => {
    const migration = readFileSync(
      new URL('../../supabase/migrations/20260928170000_employee_checklist_api.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toContain("security definer\nset search_path = ''");
    expect(migration).not.toContain('set search_path = public, extensions, pg_catalog');
    expect(migration).toContain('revoke all on table public.outbox_events from public, anon, authenticated;');
  });
});
