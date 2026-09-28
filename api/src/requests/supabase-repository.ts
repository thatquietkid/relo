import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import { ApiError } from '../shared/errors.js';
import type { ConsentSnapshot } from './consent-service.js';
import type { ProviderRequestRepository, ProviderRequestView, RelocationCaseContext, RequestEntryRecord, SubmitRequestCommand, WithdrawRequestCommand } from './request-service.js';

function repositoryError(): ApiError { return new ApiError(503, 'EMPLOYEE_DATA_UNAVAILABLE', 'Employee relocation data is unavailable.'); }

function mapEntry(value: unknown): RequestEntryRecord {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, any>;
  const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers ?? {};
  const city = Array.isArray(provider.cities) ? provider.cities[0] : provider.cities ?? {};
  return {
    id: String(row.id), cityId: String(city.id ?? provider.city_id ?? ''), cityName: String(city.name ?? ''), category: String(provider.category ?? ''),
    providerName: String(provider.name ?? ''), providerSummary: String(provider.summary ?? ''), title: String(row.title), description: String(row.description),
    sourceUrl: typeof row.source_url === 'string' ? row.source_url : null, contactPolicy: provider.contact_policy as RequestEntryRecord['contactPolicy'],
    publishedAt: typeof row.published_at === 'string' ? row.published_at : null, expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    status: row.status as RequestEntryRecord['status'],
  };
}

function mapCase(value: unknown): RelocationCaseContext {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return { id: String(row.id), tenantId: String(row.tenant_id), employeeUserId: String(row.employee_user_id), destinationCityId: String(row.destination_city_id), destinationCityName: String(row.destination_city_name ?? ''), moveDate: String(row.move_date), status: row.status as RelocationCaseContext['status'] };
}

function mapRequest(value: unknown, entry: RequestEntryRecord): ProviderRequestView {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return { id: String(row.id), userId: String(row.user_id), tenantId: String(row.tenant_id), caseId: String(row.case_id), entryId: String(row.directory_entry_id), status: row.status as ProviderRequestView['status'], submittedAt: typeof row.submitted_at === 'string' ? row.submitted_at : null, withdrawnAt: typeof row.withdrawn_at === 'string' ? row.withdrawn_at : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at), entry };
}

function mapError(error: unknown): ApiError {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? String((error as { message: string }).message) : '';
  if (message.includes('IDEMPOTENCY_KEY_CONFLICT')) return new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'The idempotency key was used for a different mutation.');
  if (message.includes('REQUEST_ALREADY_EXISTS')) return new ApiError(409, 'REQUEST_ALREADY_EXISTS', 'An active provider request already exists for this listing.');
  if (message.includes('CONSENT_REQUIRED')) return new ApiError(400, 'CONSENT_REQUIRED', 'Consent is required for every field shared with the provider.');
  if (message.includes('DESTINATION_MISMATCH')) return new ApiError(403, 'DIRECTORY_CITY_FORBIDDEN', 'Provider requests are limited to your destination.');
  if (message.includes('MEMBERSHIP_REQUIRED')) return new ApiError(403, 'MEMBERSHIP_REQUIRED', 'An active tenant membership is required.');
  if (message.includes('REQUEST_NOT_FOUND') || message.includes('ENTRY_NOT_FOUND') || message.includes('RELOCATION_CASE_NOT_FOUND')) return new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  if (message.includes('REQUEST_UNAVAILABLE')) return new ApiError(403, 'REQUEST_UNAVAILABLE', 'Provider requests are not available for this listing.');
  if (message.includes('REQUEST_NOT_WITHDRAWABLE')) return new ApiError(409, 'REQUEST_NOT_WITHDRAWABLE', 'This provider request can no longer be withdrawn.');
  return repositoryError();
}

const entrySelection = 'id, provider_id, title, description, source_url, published_at, expires_at, status, providers!inner(id, city_id, category, name, summary, contact_policy, status, cities!inner(id, name, slug, status))';

export function makeSupabaseProviderRequestRepository(client: ReturnType<typeof createSupabaseClient>): ProviderRequestRepository {
  return {
    async getCase(userId, tenantId) {
      const result = await client.from('relocation_cases').select('id, tenant_id, employee_user_id, destination_city_id, move_date, status').eq('employee_user_id', userId).eq('tenant_id', tenantId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw mapError(result.error);
      const row = result.data as Record<string, unknown> | null;
      if (!row) return null;
      const cityResult = await client.from('cities').select('name').eq('id', String(row.destination_city_id)).maybeSingle();
      if (cityResult.error) throw mapError(cityResult.error);
      const city = cityResult.data as Record<string, unknown> | null;
      return mapCase({ ...row, destination_city_name: city?.name ?? '' });
    },
    async getEntry(entryId) {
      const result = await client.from('directory_entries').select(entrySelection).eq('id', entryId).maybeSingle();
      if (result.error) throw mapError(result.error);
      return result.data ? mapEntry(result.data) : null;
    },
    async listRequests(userId, tenantId) {
      const result = await client.from('provider_requests').select('id, user_id, tenant_id, case_id, directory_entry_id, status, submitted_at, withdrawn_at, created_at, updated_at').eq('user_id', userId).eq('tenant_id', tenantId).order('created_at', { ascending: false });
      if (result.error) throw mapError(result.error);
      const requests: ProviderRequestView[] = [];
      for (const row of result.data ?? []) {
        const entry = await this.getEntry(String((row as Record<string, unknown>).directory_entry_id));
        if (entry) requests.push(mapRequest(row, entry));
      }
      return requests;
    },
    async submitRequest(input: SubmitRequestCommand) {
      const result = await client.rpc('employee_submit_provider_request', {
        p_user_id: input.userId, p_tenant_id: input.tenantId, p_case_id: input.caseId, p_entry_id: input.entryId,
        p_idempotency_key: input.idempotencyKey, p_request_hash: input.requestHash, p_consents: input.consents, p_trace_id: input.traceId,
      });
      if (result.error) throw mapError(result.error);
      const row = result.data as { provider_request?: unknown } | null;
      const entry = await this.getEntry(input.entryId);
      if (!entry || !row?.provider_request) throw repositoryError();
      return mapRequest(row.provider_request, entry);
    },
    async withdrawRequest(input: WithdrawRequestCommand) {
      const result = await client.rpc('employee_withdraw_provider_request', { p_user_id: input.userId, p_tenant_id: input.tenantId, p_request_id: input.requestId, p_trace_id: input.traceId });
      if (result.error) {
        const mapped = mapError(result.error);
        if (mapped.code === 'NOT_FOUND') return null;
        throw mapped;
      }
      const row = result.data as { provider_request?: unknown } | null;
      if (!row?.provider_request) throw repositoryError();
      const requestRow = row.provider_request as Record<string, unknown>;
      const entry = await this.getEntry(String(requestRow.directory_entry_id));
      if (!entry) throw repositoryError();
      return mapRequest(requestRow, entry);
    },
  };
}

export function createSupabaseProviderRequestRepositoryFromEnv(accessToken: string): ProviderRequestRepository {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = accessToken.trim();
  if (!url || !publishableKey || !token) throw repositoryError();
  const config: SupabaseClientConfig = { url, publishableKey, accessToken: token };
  return makeSupabaseProviderRequestRepository(createSupabaseClient(config));
}
