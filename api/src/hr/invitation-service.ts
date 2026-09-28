import { createHash, randomBytes } from 'node:crypto';
import type { IdentityContext } from '../identity/types.js';
import { ApiError } from '../shared/errors.js';

export interface EmployeeSummary {
  membershipId: string;
  userId: string;
  email: string;
  name: string | null;
  status: string;
  joinedAt: string;
  roles: string[];
}

export interface EmployeePage {
  items: EmployeeSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface InvitationRecord {
  id: string;
  tenantId: string;
  email: string;
  roleKey: 'employee';
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

export interface InvitationView {
  id: string;
  tenantId: string;
  email: string;
  role: 'employee';
  status: InvitationRecord['status'];
  expiresAt: string;
  acceptedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
  inviteUrl?: string;
}

export interface CreateInvitationInput {
  tenantId: string;
  email: string;
  invitedBy: string;
  expiresAt: string;
  tokenHash: string;
}

export interface ResendInvitationInput extends CreateInvitationInput {
  id: string;
}

export interface HrRepository {
  listEmployees(tenantId: string, input: { page: number; pageSize: number; search?: string }): Promise<{ items: EmployeeSummary[]; total: number }>;
  findActiveInvitation(tenantId: string, email: string): Promise<InvitationRecord | null>;
  createInvitation(input: CreateInvitationInput): Promise<InvitationRecord>;
  getInvitation(tenantId: string, invitationId: string): Promise<InvitationRecord | null>;
  resendInvitation(input: ResendInvitationInput): Promise<InvitationRecord | 'rate_limited' | null>;
  revokeInvitation(tenantId: string, invitationId: string): Promise<InvitationRecord | null>;
  findIdempotency?(tenantId: string, actorUserId: string, key: string): Promise<{ requestHash: string; response: InvitationView } | null>;
  saveIdempotency?(tenantId: string, actorUserId: string, key: string, requestHash: string, response: InvitationView): Promise<void>;
}

export interface CreateEmployeeInvitationInput { email: string; name?: string; role?: string; }

function assertHr(identity: IdentityContext): { tenantId: string; userId: string } {
  const membership = identity.memberships.find((candidate) => candidate.status === 'active'
    && candidate.tenant.status === 'active'
    && candidate.roles.some((role) => role.key === 'hr' || role.key === 'admin'));
  if (!membership) throw new ApiError(403, 'ROLE_REQUIRED', 'An active HR membership is required.');
  return { tenantId: membership.tenant_id, userId: identity.user.id };
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'A valid employee email is required.');
  }
  return email;
}

function pageOf(items: EmployeeSummary[], page: number, pageSize: number, total: number): EmployeePage {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

function requestHash(input: CreateEmployeeInvitationInput): string {
  return createHash('sha256').update(JSON.stringify({ email: normalizeEmail(input.email), role: input.role ?? 'employee' })).digest('hex');
}

function invitationView(record: InvitationRecord, inviteUrl?: string): InvitationView {
  return {
    id: record.id,
    tenantId: record.tenantId,
    email: record.email,
    role: record.roleKey,
    status: record.status,
    expiresAt: record.expiresAt,
    acceptedAt: record.acceptedAt,
    invitedBy: record.invitedBy,
    createdAt: record.createdAt,
    ...(inviteUrl ? { inviteUrl } : {}),
  };
}

export function makeHrService({
  repository,
  now = () => new Date(),
  frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'https://relo-web.onrender.com',
}: { repository: HrRepository; now?: () => Date; frontendOrigin?: string }) {
  const inviteUrl = (token: string) => `${frontendOrigin.replace(/\/$/, '')}/invitations/${encodeURIComponent(token)}`;

  return {
    async listTenantEmployees(identity: IdentityContext, input: { page?: number; pageSize?: number; search?: string } = {}): Promise<EmployeePage> {
      const { tenantId } = assertHr(identity);
      const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
      const pageSize = Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0 ? Math.min(input.pageSize!, 100) : 20;
      const search = input.search?.trim().replace(/\s+/g, ' ');
      if (search && search.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'Employee search must be 100 characters or fewer.');
      const result = await repository.listEmployees(tenantId, { page, pageSize, ...(search ? { search } : {}) });
      return pageOf(result.items, page, pageSize, result.total);
    },

    async createEmployeeInvitation(identity: IdentityContext, input: CreateEmployeeInvitationInput, idempotencyKey: string): Promise<InvitationView> {
      const { tenantId, userId } = assertHr(identity);
      if (input.role && input.role !== 'employee') throw new ApiError(403, 'ROLE_NOT_ALLOWED', 'HR can only invite employees.');
      const email = normalizeEmail(input.email);
      if (!idempotencyKey || idempotencyKey.length < 8) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid idempotency key is required.');
      const hash = requestHash({ ...input, email });
      const cached = await repository.findIdempotency?.(tenantId, userId, idempotencyKey);
      if (cached) {
        if (cached.requestHash !== hash) throw new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'The idempotency key was used for a different invitation.');
        return cached.response;
      }
      if (await repository.findActiveInvitation(tenantId, email)) {
        throw new ApiError(409, 'INVITATION_ALREADY_PENDING', 'An active invitation already exists for this email.');
      }
      const token = randomBytes(32).toString('hex');
      const record = await repository.createInvitation({
        tenantId,
        email,
        invitedBy: userId,
        expiresAt: new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        tokenHash: createHash('sha256').update(token).digest('hex'),
      });
      const response = invitationView(record, inviteUrl(token));
      await repository.saveIdempotency?.(tenantId, userId, idempotencyKey, hash, response);
      return response;
    },

    async resendEmployeeInvitation(identity: IdentityContext, invitationId: string, idempotencyKey: string): Promise<InvitationView> {
      const { tenantId, userId } = assertHr(identity);
      if (!idempotencyKey || idempotencyKey.length < 8) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid idempotency key is required.');
      const existing = await repository.getInvitation(tenantId, invitationId);
      if (!existing || existing.status !== 'pending') throw new ApiError(404, 'NOT_FOUND', 'The invitation was not found.');
      const token = randomBytes(32).toString('hex');
      const result = await repository.resendInvitation({ id: invitationId, tenantId, email: existing.email, invitedBy: userId, expiresAt: new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), tokenHash: createHash('sha256').update(token).digest('hex') });
      if (result === 'rate_limited') throw new ApiError(429, 'INVITATION_RESEND_RATE_LIMITED', 'Please wait before resending this invitation.');
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The invitation was not found.');
      return invitationView(result, inviteUrl(token));
    },

    async revokeEmployeeInvitation(identity: IdentityContext, invitationId: string): Promise<InvitationView> {
      const { tenantId } = assertHr(identity);
      const result = await repository.revokeInvitation(tenantId, invitationId);
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The invitation was not found.');
      return invitationView(result);
    },
  };
}

export type HrService = ReturnType<typeof makeHrService>;
