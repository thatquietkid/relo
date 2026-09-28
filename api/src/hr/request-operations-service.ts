import type { IdentityContext } from '../identity/types.js';
import { ApiError } from '../shared/errors.js';
import { tenantForHr } from './invitation-service.js';

export type RequestOperationsStatus = 'submitted' | 'in_review' | 'approved' | 'in_progress' | 'completed' | 'withdrawn' | 'rejected';
export interface RequestOperationsView {
  id: string;
  tenantId: string;
  employeeUserId: string;
  directoryEntryId: string;
  entryTitle: string;
  providerName: string;
  status: RequestOperationsStatus;
  submittedAt: string;
  updatedAt: string;
}
export interface RequestOperationsPage { items: RequestOperationsView[]; page: number; pageSize: number; total: number; totalPages: number; }

export interface RequestOperationsRepository {
  listRequests(tenantId: string, input: { page: number; pageSize: number; status?: RequestOperationsStatus }): Promise<{ items: RequestOperationsView[]; total: number }>;
  getRequest(tenantId: string, requestId: string): Promise<RequestOperationsView | null>;
  updateRequestStatus(tenantId: string, requestId: string, status: RequestOperationsStatus): Promise<RequestOperationsView | null>;
}

const TRANSITIONS: Record<RequestOperationsStatus, readonly RequestOperationsStatus[]> = {
  submitted: ['in_review', 'approved', 'rejected'],
  in_review: ['approved', 'rejected'],
  approved: ['in_progress'],
  in_progress: ['completed'],
  completed: [],
  withdrawn: [],
  rejected: [],
};

export function makeRequestOperationsService({ repository }: { repository: RequestOperationsRepository }) {
  return {
    async listTenantRequests(identity: IdentityContext, input: { page?: number; pageSize?: number; status?: RequestOperationsStatus } = {}): Promise<RequestOperationsPage> {
      const { tenantId } = tenantForHr(identity);
      const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
      const pageSize = Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0 ? Math.min(input.pageSize!, 100) : 20;
      const result = await repository.listRequests(tenantId, { page, pageSize, ...(input.status ? { status: input.status } : {}) });
      return { ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) };
    },

    async updateRequestStatus(identity: IdentityContext, requestId: string, status: RequestOperationsStatus): Promise<RequestOperationsView> {
      const { tenantId } = tenantForHr(identity);
      const current = await repository.getRequest(tenantId, requestId);
      if (!current) throw new ApiError(404, 'NOT_FOUND', 'The provider request was not found.');
      if (!Object.prototype.hasOwnProperty.call(TRANSITIONS, status) || !TRANSITIONS[current.status].includes(status)) {
        throw new ApiError(409, 'INVALID_REQUEST_TRANSITION', 'The provider request cannot move to that status.');
      }
      const result = await repository.updateRequestStatus(tenantId, requestId, status);
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The provider request was not found.');
      return result;
    },
  };
}

export type RequestOperationsService = ReturnType<typeof makeRequestOperationsService>;
