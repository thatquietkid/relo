import { createHash, randomUUID } from 'node:crypto';
import type { DomainEvent } from '@relo/contracts/events';
import type { IdentityContext } from '../identity/types.js';
import { selectEmployeeMembership } from '../employee/checklist-service.js';
import { ApiError } from '../shared/errors.js';
import { snapshotRequiredConsent, type ConsentFieldPreview, type ConsentInput, type ConsentSnapshot, type RequestField } from './consent-service.js';

export interface RequestEntryRecord {
  id: string;
  cityId: string;
  cityName: string;
  category: string;
  providerName: string;
  providerSummary: string;
  title: string;
  description: string;
  sourceUrl: string | null;
  contactPolicy: 'employee_request' | 'no_direct_contact';
  publishedAt: string | null;
  expiresAt: string | null;
  status: 'draft' | 'published' | 'archived';
}

export interface RelocationCaseContext {
  id: string;
  tenantId: string;
  employeeUserId: string;
  destinationCityId: string;
  destinationCityName: string;
  moveDate: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
}

export interface RequestDestination {
  cityId: string;
  cityName: string;
  moveDate: string;
}

export interface RequestPreview {
  entry: RequestEntryRecord;
  destination: RequestDestination;
  fields: ConsentFieldPreview[];
}

export interface RequestInput {
  entryId: string;
  consents: ConsentInput[];
}

export interface ProviderRequestView {
  id: string;
  userId: string;
  tenantId: string;
  caseId: string;
  entryId: string;
  status: 'submitted' | 'in_review' | 'approved' | 'in_progress' | 'completed' | 'withdrawn' | 'rejected';
  submittedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
  entry: RequestEntryRecord;
}

export type RequestEventType = 'ProviderRequestSubmitted' | 'ConsentWithdrawn' | 'ProviderRequestWithdrawn';
export type RequestEvent = DomainEvent<Record<string, unknown>> & { type: RequestEventType; tenantId: string; actorId: string; requestId: string };

export interface SubmitRequestCommand {
  userId: string;
  tenantId: string;
  caseId: string;
  entryId: string;
  idempotencyKey: string;
  requestHash: string;
  consents: ConsentSnapshot[];
  traceId: string;
}

export interface WithdrawRequestCommand {
  userId: string;
  tenantId: string;
  requestId: string;
  traceId: string;
}

export interface ProviderRequestRepository {
  getCase(userId: string, tenantId: string): Promise<RelocationCaseContext | null>;
  getEntry(entryId: string): Promise<RequestEntryRecord | null>;
  listRequests(userId: string, tenantId: string): Promise<ProviderRequestView[]>;
  submitRequest(input: SubmitRequestCommand): Promise<ProviderRequestView>;
  withdrawRequest(input: WithdrawRequestCommand): Promise<ProviderRequestView | null>;
}

function assertEmployee(identity: IdentityContext) {
  const membership = selectEmployeeMembership(identity);
  if (!identity.user.email) throw new ApiError(400, 'EMAIL_REQUIRED', 'A verified email address is required for provider requests.');
  return { userId: identity.user.id, email: identity.user.email, tenantId: membership.tenant_id };
}

function visibleEntry(entry: RequestEntryRecord | null, now: Date): RequestEntryRecord {
  if (!entry || entry.status !== 'published' || !entry.publishedAt || new Date(entry.publishedAt) > now
    || (entry.expiresAt !== null && new Date(entry.expiresAt) <= now)) {
    throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  if (entry.contactPolicy !== 'employee_request') {
    throw new ApiError(403, 'REQUEST_UNAVAILABLE', 'Provider requests are not available for this listing.');
  }
  return entry;
}

function assertDestination(entry: RequestEntryRecord, relocation: RelocationCaseContext): void {
  if (entry.cityId !== relocation.destinationCityId) {
    throw new ApiError(403, 'DIRECTORY_CITY_FORBIDDEN', 'Provider requests are limited to your destination.');
  }
}

function requestHash(input: RequestInput, caseId: string, snapshots: readonly ConsentSnapshot[]): string {
  return createHash('sha256').update(JSON.stringify({ caseId, entryId: input.entryId, consents: snapshots })).digest('hex');
}

function fieldsFor(email: string, relocation: RelocationCaseContext): ConsentFieldPreview[] {
  return [
    { field: 'email', label: 'Email address', value: email, required: true },
    { field: 'destination_city', label: 'Destination city', value: relocation.destinationCityName, required: true },
    { field: 'move_date', label: 'Move date', value: relocation.moveDate, required: true },
  ];
}

export function makeRequestService({ repository, now = () => new Date() }: { repository: ProviderRequestRepository; now?: () => Date }) {
  async function context(identity: IdentityContext, entryId: string) {
    const { userId, email, tenantId } = assertEmployee(identity);
    const relocation = await repository.getCase(userId, tenantId);
    if (!relocation || relocation.status === 'cancelled') throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
    if (relocation.status !== 'active') throw new ApiError(409, 'CASE_NOT_ACTIVE', 'The relocation case must be active before requesting provider support.');
    const entry = visibleEntry(await repository.getEntry(entryId), now());
    assertDestination(entry, relocation);
    return { userId, email, tenantId, relocation, entry };
  }

  return {
    async previewRequest(identity: IdentityContext, entryId: string): Promise<RequestPreview> {
      const { email, relocation, entry } = await context(identity, entryId);
      return {
        entry,
        destination: { cityId: relocation.destinationCityId, cityName: relocation.destinationCityName, moveDate: relocation.moveDate },
        fields: fieldsFor(email, relocation),
      };
    },

    async submitRequest(identity: IdentityContext, input: RequestInput, idempotencyKey: string, traceId: string = randomUUID()): Promise<ProviderRequestView> {
      if (!/^[\x21-\x7e]{8,128}$/.test(idempotencyKey)) throw new ApiError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be 8 to 128 printable ASCII characters.');
      const { userId, email, tenantId, relocation, entry } = await context(identity, input.entryId);
      const fields = fieldsFor(email, relocation);
      const consents = snapshotRequiredConsent(fields, input.consents);
      return repository.submitRequest({ userId, tenantId, caseId: relocation.id, entryId: entry.id, idempotencyKey, requestHash: requestHash(input, relocation.id, consents), consents, traceId });
    },

    async listRequests(identity: IdentityContext): Promise<ProviderRequestView[]> {
      const { userId, tenantId } = assertEmployee(identity);
      return repository.listRequests(userId, tenantId);
    },

    async withdrawRequest(identity: IdentityContext, requestId: string, traceId: string = randomUUID()): Promise<ProviderRequestView> {
      const { userId, tenantId } = assertEmployee(identity);
      const request = await repository.withdrawRequest({ userId, tenantId, requestId, traceId });
      if (!request) throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
      return request;
    },
  };
}

export type RequestService = ReturnType<typeof makeRequestService>;
export type { RequestField };
