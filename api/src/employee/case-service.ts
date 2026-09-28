import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from '../identity/types.js';
import type { RelocationCaseView } from './types.js';
import type { EmployeeRepository } from './checklist-service.js';
import { selectEmployeeMembership } from './checklist-service.js';

export interface CaseService {
  getMyRelocationCase(identity: IdentityContext): Promise<RelocationCaseView>;
}

function progressFor(items: { state: string }[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.state === 'completed').length / items.length) * 100);
}

export function makeCaseService({ repository }: { repository: EmployeeRepository }): CaseService {
  return {
    async getMyRelocationCase(identity) {
      const membership = selectEmployeeMembership(identity);
      const row = await repository.getCaseForEmployee(identity.user.id, membership.tenant_id);
      if (!row || row.status === 'cancelled') {
        throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
      }

      const items = await repository.listChecklist(row.id);
      const { tenant_id: _tenantId, employee_user_id: _employeeUserId, ...view } = row;
      return { ...view, progress_percent: progressFor(items) };
    },
  };
}
