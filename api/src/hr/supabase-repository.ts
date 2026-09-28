import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import { ApiError } from '../shared/errors.js';
import type { EmployeeSummary, HrRepository, InvitationRecord, InvitationView } from './invitation-service.js';

function repositoryError(): ApiError { return new ApiError(503, 'HR_DATA_UNAVAILABLE', 'HR data is unavailable.'); }

function mapEmployee(value: unknown): EmployeeSummary {
  const row = value as Record<string, unknown>;
  return { membershipId: String(row.membership_id), userId: String(row.user_id), email: String(row.email ?? ''), name: typeof row.name === 'string' ? row.name : null, status: String(row.status), joinedAt: String(row.joined_at), roles: Array.isArray(row.roles) ? row.roles.map(String) : [] };
}

function mapInvitation(value: unknown): InvitationRecord {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return { id: String(row.id), tenantId: String(row.tenant_id), email: String(row.email), roleKey: 'employee', status: row.status as InvitationRecord['status'], expiresAt: String(row.expires_at), acceptedAt: typeof row.accepted_at === 'string' ? row.accepted_at : null, invitedBy: typeof row.invited_by === 'string' ? row.invited_by : null, createdAt: String(row.created_at) };
}

function mapError(error: unknown): ApiError {
  const message = typeof (error as { message?: unknown })?.message === 'string' ? String((error as { message: string }).message) : '';
  if (message.includes('HR_ACCESS_DENIED')) return new ApiError(403, 'ROLE_REQUIRED', 'An active HR membership is required.');
  if (message.includes('ROLE_NOT_ALLOWED')) return new ApiError(403, 'ROLE_NOT_ALLOWED', 'HR can only invite employees.');
  if (message.includes('INVITATION_ALREADY_PENDING')) return new ApiError(409, 'INVITATION_ALREADY_PENDING', 'An active invitation already exists for this email.');
  if (message.includes('INVITATION_RESEND_RATE_LIMITED')) return new ApiError(429, 'INVITATION_RESEND_RATE_LIMITED', 'Please wait before resending this invitation.');
  if (message.includes('INVITATION_NOT_FOUND')) return new ApiError(404, 'NOT_FOUND', 'The invitation was not found.');
  return repositoryError();
}

function parseRpcPage(value: unknown): { items: EmployeeSummary[]; total: number } {
  if (!value || typeof value !== 'object') throw repositoryError();
  const row = value as Record<string, unknown>;
  return { items: Array.isArray(row.items) ? row.items.map(mapEmployee) : [], total: Number(row.total ?? 0) };
}

export function makeSupabaseHrRepository(client: ReturnType<typeof createSupabaseClient>): HrRepository {
  return {
    async listEmployees(tenantId, input) {
      const result = await client.rpc('hr_list_tenant_employees', { p_tenant_id: tenantId, p_page: input.page, p_page_size: input.pageSize, p_search: input.search ?? null });
      if (result.error) throw mapError(result.error);
      return parseRpcPage(result.data);
    },
    async findActiveInvitation(tenantId, email) {
      const result = await client.from('invitations').select('id, tenant_id, email, role_key, status, expires_at, accepted_at, invited_by, created_at').eq('tenant_id', tenantId).eq('email', email).eq('status', 'pending').maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? mapInvitation(result.data) : null;
    },
    async createInvitation(input) {
      const result = await client.rpc('hr_create_employee_invitation', { p_tenant_id: input.tenantId, p_email: input.email, p_created_by: input.invitedBy, p_expires_at: input.expiresAt, p_token_hash: input.tokenHash });
      if (result.error) throw mapError(result.error);
      return mapInvitation(result.data);
    },
    async getInvitation(tenantId, invitationId) {
      const result = await client.from('invitations').select('id, tenant_id, email, role_key, status, expires_at, accepted_at, invited_by, created_at').eq('tenant_id', tenantId).eq('id', invitationId).maybeSingle();
      if (result.error) throw repositoryError();
      return result.data ? mapInvitation(result.data) : null;
    },
    async resendInvitation(input) {
      const result = await client.rpc('hr_resend_employee_invitation', { p_tenant_id: input.tenantId, p_invitation_id: input.id, p_expires_at: input.expiresAt, p_token_hash: input.tokenHash });
      if (result.error) throw mapError(result.error);
      return mapInvitation(result.data);
    },
    async revokeInvitation(tenantId, invitationId) {
      const result = await client.rpc('hr_revoke_employee_invitation', { p_tenant_id: tenantId, p_invitation_id: invitationId });
      if (result.error) throw mapError(result.error);
      return result.data ? mapInvitation(result.data) : null;
    },
    async findIdempotency(tenantId, actorUserId, key) {
      const result = await client.from('idempotency_keys').select('request_hash, response_body').eq('tenant_id', tenantId).eq('actor_user_id', actorUserId).eq('key', key).gt('expires_at', new Date().toISOString()).maybeSingle();
      if (result.error) throw repositoryError();
      if (!result.data) return null;
      return { requestHash: String(result.data.request_hash), response: result.data.response_body as InvitationView };
    },
    async saveIdempotency(tenantId, actorUserId, key, requestHash, response) {
      const result = await client.from('idempotency_keys').insert({ tenant_id: tenantId, actor_user_id: actorUserId, key, request_hash: requestHash, response_status: 201, response_body: response, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
      if (result.error && result.error.code !== '23505') throw repositoryError();
    },
  };
}

export function createSupabaseHrRepositoryFromEnv(accessToken: string): HrRepository {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = accessToken.trim();
  if (!url || !publishableKey || !token) throw repositoryError();
  const config: SupabaseClientConfig = { url, publishableKey, accessToken: token };
  return makeSupabaseHrRepository(createSupabaseClient(config));
}
