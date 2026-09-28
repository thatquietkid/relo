import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import { ApiError } from '../shared/errors.js';
import type { ProgramRepository, ProgramView, UpdateProgramPatch } from './program-service.js';
import type { RequestOperationsRepository, RequestOperationsStatus, RequestOperationsView } from './request-operations-service.js';
import type { HrSettingsPatch, HrSettingsRepository, HrSettingsView } from './settings-service.js';

export type HrOperationsRepository = ProgramRepository & RequestOperationsRepository & HrSettingsRepository;

function repositoryError(): ApiError { return new ApiError(503, 'HR_DATA_UNAVAILABLE', 'HR data is unavailable.'); }

function mapProgram(value: unknown): ProgramView {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return { id: String(row.id), tenantId: String(row.tenant_id), name: String(row.name), destinationCityId: String(row.destination_city_id), status: row.status as ProgramView['status'], startsAt: String(row.starts_at), endsAt: String(row.ends_at), createdBy: String(row.created_by), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

function nested(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function mapRequest(value: unknown): RequestOperationsView {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  const relocation = nested(row.relocation_case);
  const entry = nested(row.directory_entry);
  const provider = nested(entry.provider);
  return { id: String(row.id), tenantId: String(relocation.tenant_id), employeeUserId: String(relocation.employee_user_id), directoryEntryId: String(row.directory_entry_id), entryTitle: String(entry.title ?? ''), providerName: String(provider.name ?? ''), status: row.status as RequestOperationsStatus, submittedAt: String(row.submitted_at), updatedAt: String(row.updated_at) };
}

function mapSettings(value: unknown): HrSettingsView {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  const channels = row.notification_settings && typeof row.notification_settings === 'object' ? row.notification_settings as Record<string, unknown> : {};
  return { timezone: String(row.timezone), channels: { email: channels.email !== false, inApp: channels.inApp !== false }, defaultProgramStatus: row.default_program_status === 'active' ? 'active' : 'draft', updatedAt: String(row.updated_at) };
}

function mapError(error: unknown): ApiError {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? String((error as { message: string }).message) : '';
  if (message.includes('PROGRAM_MEMBERSHIP_TENANT_MISMATCH')) return new ApiError(403, 'FORBIDDEN', 'The program is outside the selected tenant.');
  if (message.includes('INVALID_PROVIDER_REQUEST_STATUS_TRANSITION')) return new ApiError(409, 'INVALID_REQUEST_TRANSITION', 'The provider request cannot move to that status.');
  return repositoryError();
}

const programSelect = 'id, tenant_id, name, destination_city_id, status, starts_at, ends_at, created_by, created_at, updated_at';
const requestSelect = 'id, directory_entry_id, status, submitted_at, updated_at, relocation_case:relocation_cases!inner(tenant_id, employee_user_id), directory_entry:directory_entries(title, provider:providers(name))';

export function makeSupabaseHrOperationsRepository(client: ReturnType<typeof createSupabaseClient>): HrOperationsRepository {
  return {
    async listPrograms(tenantId, input) {
      const from = (input.page - 1) * input.pageSize;
      const result = await client.from('programs').select(programSelect, { count: 'exact' }).eq('tenant_id', tenantId).order('starts_at', { ascending: false }).range(from, from + input.pageSize - 1);
      if (result.error) throw repositoryError();
      return { items: (result.data ?? []).map(mapProgram), total: result.count ?? 0 };
    },
    async createProgram(input) {
      const result = await client.from('programs').insert({ tenant_id: input.tenantId, created_by: input.createdBy, name: input.name, destination_city_id: input.destinationCityId, starts_at: input.startsAt, ends_at: input.endsAt, status: input.status }).select(programSelect).single();
      if (result.error) throw repositoryError();
      return mapProgram(result.data);
    },
    async updateProgram(tenantId, programId, patch: UpdateProgramPatch) {
      const values: Record<string, unknown> = {};
      if (patch.name !== undefined) values.name = patch.name.trim();
      if (patch.destinationCityId !== undefined) values.destination_city_id = patch.destinationCityId;
      if (patch.startsAt !== undefined) values.starts_at = patch.startsAt;
      if (patch.endsAt !== undefined) values.ends_at = patch.endsAt;
      if (patch.status !== undefined) values.status = patch.status;
      const result = await client.from('programs').update(values).eq('tenant_id', tenantId).eq('id', programId).select(programSelect).maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? mapProgram(result.data) : null;
    },
    async findIdempotency(tenantId, actorUserId, key) {
      const result = await client.from('idempotency_keys').select('request_hash, response_body').eq('tenant_id', tenantId).eq('actor_user_id', actorUserId).eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? { requestHash: String(result.data.request_hash), response: result.data.response_body as ProgramView } : null;
    },
    async saveIdempotency(tenantId, actorUserId, key, requestHash, response) {
      const result = await client.from('idempotency_keys').insert({ tenant_id: tenantId, actor_user_id: actorUserId, key, request_hash: requestHash, response_status: 201, response_body: response, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      if (result.error && result.error.code !== '23505') throw repositoryError();
    },
    async listRequests(_tenantId, input) {
      const from = (input.page - 1) * input.pageSize;
      let query = client.from('provider_requests').select(requestSelect, { count: 'exact' }).order('updated_at', { ascending: false }).range(from, from + input.pageSize - 1);
      if (input.status) query = query.eq('status', input.status);
      const result = await query;
      if (result.error) throw repositoryError();
      return { items: (result.data ?? []).map(mapRequest), total: result.count ?? 0 };
    },
    async getRequest(_tenantId, requestId) {
      const result = await client.from('provider_requests').select(requestSelect).eq('id', requestId).maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? mapRequest(result.data) : null;
    },
    async updateRequestStatus(_tenantId, requestId, status) {
      const result = await client.from('provider_requests').update({ status }).eq('id', requestId).select(requestSelect).maybeSingle();
      if (result.error) throw mapError(result.error);
      return result.data ? mapRequest(result.data) : null;
    },
    async getSettings(tenantId) {
      const result = await client.from('tenant_settings').select('tenant_id, timezone, notification_settings, default_program_status, updated_at').eq('tenant_id', tenantId).maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? mapSettings(result.data) : null;
    },
    async updateSettings(tenantId, actorUserId, patch: HrSettingsPatch) {
      const values = { tenant_id: tenantId, timezone: patch.timezone, notification_settings: patch.channels, default_program_status: patch.defaultProgramStatus, updated_by: actorUserId };
      const result = await client.from('tenant_settings').upsert(values, { onConflict: 'tenant_id' }).select('tenant_id, timezone, notification_settings, default_program_status, updated_at').single();
      if (result.error) throw repositoryError();
      return mapSettings(result.data);
    },
  };
}

export function createSupabaseHrOperationsRepositoryFromEnv(accessToken: string): HrOperationsRepository {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = accessToken.trim();
  if (!url || !publishableKey || !token) throw repositoryError();
  const config: SupabaseClientConfig = { url, publishableKey, accessToken: token };
  return makeSupabaseHrOperationsRepository(createSupabaseClient(config));
}
