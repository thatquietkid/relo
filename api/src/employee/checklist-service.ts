import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertMembershipActive } from '../authorization/policy.js';
import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from '../identity/types.js';
import type { MembershipView } from '../tenancy/types.js';
import type {
  ChecklistItemRow,
  ChecklistItemState,
  ChecklistItemView,
  RelocationCaseRow,
} from './types.js';

export const CHECKLIST_STATES = ['pending', 'in_progress', 'completed', 'skipped'] as const;
const checklistStateSchema = z.enum(CHECKLIST_STATES);

export type EmployeeEventType =
  | 'RelocationCaseActivated'
  | 'ChecklistItemCompleted'
  | 'ChecklistProgressChanged';

export interface EmployeeEvent {
  id: string;
  type: EmployeeEventType;
  version: 1;
  occurredAt: string;
  tenantId: string;
  actorId: string;
  payload: Record<string, unknown>;
}

export interface IdempotencyRecord {
  tenantId: string;
  actorUserId: string;
  key: string;
  requestHash: string;
  response: ChecklistItemView;
}

export interface EmployeeOutboxPort {
  appendEvent(event: EmployeeEvent): Promise<void>;
}

export interface EmployeeIdempotencyPort {
  findIdempotency(tenantId: string, actorUserId: string, key: string): Promise<IdempotencyRecord | null>;
  saveIdempotency(record: IdempotencyRecord): Promise<void>;
}

export interface EmployeeRepositoryTransaction extends EmployeeOutboxPort, EmployeeIdempotencyPort {
  getCaseForEmployee(userId: string, tenantId: string): Promise<RelocationCaseRow | null>;
  getCaseById(caseId: string): Promise<RelocationCaseRow | null>;
  listChecklist(caseId: string): Promise<ChecklistItemRow[]>;
  getChecklistItem(caseId: string, itemId: string): Promise<ChecklistItemRow | null>;
  updateChecklistItem(
    itemId: string,
    patch: Pick<ChecklistItemRow, 'state' | 'completed_at' | 'updated_at'>,
  ): Promise<ChecklistItemRow>;
  updateCaseProgress(caseId: string, progressPercent: number): Promise<RelocationCaseRow>;
}

export interface EmployeeRepository extends EmployeeRepositoryTransaction {
  withTransaction<T>(work: (transaction: EmployeeRepositoryTransaction) => Promise<T>): Promise<T>;
}

export interface ChecklistService {
  listChecklist(identity: IdentityContext, caseId: string): Promise<ChecklistItemView[]>;
  setChecklistState(
    identity: IdentityContext,
    caseId: string,
    itemId: string,
    state: ChecklistItemState,
    idempotencyKey: string,
  ): Promise<ChecklistItemView>;
}

export function selectEmployeeMembership(identity: IdentityContext): MembershipView {
  const membershipsForUser = identity.memberships.filter((membership) => membership.user_id === identity.user.id);
  const activeMemberships = membershipsForUser.filter(
    (membership) => membership.status === 'active' && membership.tenant.status === 'active',
  );

  if (activeMemberships.length > 1) {
    throw new ApiError(400, 'TENANT_SELECTION_REQUIRED', 'Select a tenant before continuing.');
  }
  if (activeMemberships.length === 1) return activeMemberships[0];

  const membership = membershipsForUser[0];
  if (membership) assertMembershipActive(membership);
  throw new ApiError(403, 'MEMBERSHIP_REQUIRED', 'An active tenant membership is required.');
}

export function notFoundError(): ApiError {
  return new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
}

export function assertOwnCase(identity: IdentityContext, row: RelocationCaseRow | null): RelocationCaseRow {
  if (!row || row.status === 'cancelled') throw notFoundError();
  const membership = selectEmployeeMembership(identity);
  if (row.employee_user_id !== identity.user.id || row.tenant_id !== membership.tenant_id) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this relocation case.');
  }
  return row;
}

function validationError(error: z.ZodError): ApiError {
  return new ApiError(400, 'VALIDATION_ERROR', 'The checklist state is invalid.', {
    issues: error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path,
    })),
  });
}

function requestHash(caseId: string, itemId: string, state: ChecklistItemState): string {
  return createHash('sha256')
    .update(JSON.stringify({ caseId, itemId, state }), 'utf8')
    .digest('hex');
}

function invalidTransition(from: ChecklistItemState, to: ChecklistItemState): ApiError {
  return new ApiError(
    409,
    'INVALID_CHECKLIST_STATE_TRANSITION',
    `Checklist item cannot transition from ${from} to ${to}.`,
  );
}

function canTransition(from: ChecklistItemState, to: ChecklistItemState): boolean {
  const transitions: Record<ChecklistItemState, readonly ChecklistItemState[]> = {
    pending: ['pending', 'in_progress', 'completed', 'skipped'],
    in_progress: ['pending', 'in_progress', 'completed', 'skipped'],
    completed: ['completed', 'pending', 'in_progress'],
    skipped: ['skipped', 'pending', 'in_progress'],
  };
  return transitions[from].includes(to);
}

function progressFor(items: ChecklistItemRow[]): number {
  if (items.length === 0) return 0;
  return Math.round((items.filter((item) => item.state === 'completed').length / items.length) * 100);
}

function event(
  type: EmployeeEventType,
  identity: IdentityContext,
  tenantId: string,
  occurredAt: string,
  payload: Record<string, unknown>,
): EmployeeEvent {
  return {
    id: randomUUID(),
    type,
    version: 1,
    occurredAt,
    tenantId,
    actorId: identity.user.id,
    payload,
  };
}

export function makeChecklistService({
  repository,
  now = () => new Date(),
}: {
  repository: EmployeeRepository;
  now?: () => Date;
}): ChecklistService {
  return {
    async listChecklist(identity, caseId) {
      const row = assertOwnCase(identity, await repository.getCaseById(caseId));
      return repository.listChecklist(row.id);
    },

    async setChecklistState(identity, caseId, itemId, state, idempotencyKey) {
      const parsedState = checklistStateSchema.safeParse(state);
      if (!parsedState.success) throw validationError(parsedState.error);

      const membership = selectEmployeeMembership(identity);
      const hash = requestHash(caseId, itemId, parsedState.data);

      return repository.withTransaction(async (transaction) => {
        const existing = await transaction.findIdempotency(membership.tenant_id, identity.user.id, idempotencyKey);
        if (existing) {
          if (existing.requestHash !== hash) {
            throw new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'The idempotency key was used for a different mutation.');
          }
          return existing.response;
        }

        const row = assertOwnCase(identity, await transaction.getCaseById(caseId));
        const item = await transaction.getChecklistItem(row.id, itemId);
        if (!item) throw notFoundError();

        if (!canTransition(item.state, parsedState.data)) {
          throw invalidTransition(item.state, parsedState.data);
        }

        const stateChanged = item.state !== parsedState.data;
        const timestamp = now().toISOString();
        const completedAt = parsedState.data === 'completed'
          ? item.completed_at ?? timestamp
          : null;
        const updated = stateChanged
          ? await transaction.updateChecklistItem(item.id, {
            state: parsedState.data,
            completed_at: completedAt,
            updated_at: timestamp,
          })
          : item;

        if (stateChanged) {
          const items = await transaction.listChecklist(row.id);
          const progress = progressFor(items);
          if (progress !== row.progress_percent) {
            await transaction.updateCaseProgress(row.id, progress);
            await transaction.appendEvent(event(
              'ChecklistProgressChanged',
              identity,
              row.tenant_id,
              timestamp,
              {
                tenant_id: row.tenant_id,
                case_id: row.id,
                employee_user_id: row.employee_user_id,
                previous_progress_percent: row.progress_percent,
                progress_percent: progress,
              },
            ));
          }
          if (parsedState.data === 'completed') {
            await transaction.appendEvent(event(
              'ChecklistItemCompleted',
              identity,
              row.tenant_id,
              timestamp,
              {
                tenant_id: row.tenant_id,
                case_id: row.id,
                employee_user_id: row.employee_user_id,
                item_id: item.id,
                state: parsedState.data,
              },
            ));
          }
        }

        await transaction.saveIdempotency({
          tenantId: membership.tenant_id,
          actorUserId: identity.user.id,
          key: idempotencyKey,
          requestHash: hash,
          response: updated,
        });
        return updated;
      });
    },
  };
}
