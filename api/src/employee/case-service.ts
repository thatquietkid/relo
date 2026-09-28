import { randomUUID } from 'node:crypto';
import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from '../identity/types.js';
import type { RelocationCaseView } from './types.js';
import type {
  ActivateCaseInput,
  DefaultChecklistItem,
  EmployeeRepository,
} from './checklist-service.js';
import { selectEmployeeMembership } from './checklist-service.js';

export const DEFAULT_CHECKLIST_ITEMS: readonly DefaultChecklistItem[] = [
  { key: 'documents', title: 'Collect documents', description: 'Identity documents', due_at: null, sort_order: 1 },
  { key: 'housing', title: 'Compare housing', description: 'Review housing options', due_at: null, sort_order: 2 },
  { key: 'school', title: 'Review schools', description: 'Review schools and childcare', due_at: null, sort_order: 3 },
  { key: 'banking', title: 'Set up banking', description: 'Prepare local banking', due_at: null, sort_order: 4 },
];

export interface CaseService {
  getMyRelocationCase(identity: IdentityContext, traceId?: string): Promise<RelocationCaseView>;
  activateMyRelocationCase(identity: IdentityContext, traceId?: string): Promise<RelocationCaseView>;
}

function progressFor(items: { state: string }[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.state === 'completed').length / items.length) * 100);
}

export function makeCaseService({ repository }: { repository: EmployeeRepository }): CaseService {
  const viewFor = (row: import('./types.js').RelocationCaseRow, items: { state: string }[]): RelocationCaseView => {
    const { tenant_id: _tenantId, employee_user_id: _employeeUserId, ...view } = row;
    return { ...view, progress_percent: progressFor(items) };
  };

  return {
    async getMyRelocationCase(identity, traceId = randomUUID()) {
      return this.activateMyRelocationCase(identity, traceId);
    },

    async activateMyRelocationCase(identity, traceId = randomUUID()) {
      const membership = selectEmployeeMembership(identity);
      const row = await repository.getCaseForEmployee(identity.user.id, membership.tenant_id);
      if (!row || row.status === 'cancelled') {
        throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
      }

      if (row.status === 'draft') {
        if (!repository.activateCase) {
          throw new ApiError(503, 'EMPLOYEE_ACTIVATION_UNAVAILABLE', 'Employee relocation activation is unavailable.');
        }
        const input: ActivateCaseInput = {
          userId: identity.user.id,
          tenantId: membership.tenant_id,
          defaults: DEFAULT_CHECKLIST_ITEMS.map((item) => ({ ...item })),
          traceId,
        };
        const activation = await repository.activateCase(input);
        return viewFor(activation.relocationCase, activation.checklist);
      }

      return viewFor(row, await repository.listChecklist(row.id));
    },
  };
}
