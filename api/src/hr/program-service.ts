import { createHash } from 'node:crypto';
import type { IdentityContext } from '../identity/types.js';
import type { ProgramStatus } from '../operations/types.js';
import { ApiError } from '../shared/errors.js';
import { tenantForHr } from './invitation-service.js';

export interface ProgramView {
  id: string;
  tenantId: string;
  name: string;
  destinationCityId: string;
  status: ProgramStatus;
  startsAt: string;
  endsAt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProgramPage { items: ProgramView[]; page: number; pageSize: number; total: number; totalPages: number; }
export interface CreateProgramInput { name: string; destinationCityId: string; startsAt: string; endsAt: string; status?: ProgramStatus; }
export type UpdateProgramPatch = Partial<Pick<ProgramView, 'name' | 'destinationCityId' | 'startsAt' | 'endsAt' | 'status'>>;

export interface ProgramRepository {
  listPrograms(tenantId: string, input: { page: number; pageSize: number }): Promise<{ items: ProgramView[]; total: number }>;
  createProgram(input: { tenantId: string; createdBy: string; name: string; destinationCityId: string; startsAt: string; endsAt: string; status: ProgramStatus }): Promise<ProgramView>;
  updateProgram(tenantId: string, programId: string, patch: UpdateProgramPatch): Promise<ProgramView | null>;
  findIdempotency?(tenantId: string, actorUserId: string, key: string): Promise<{ requestHash: string; response: ProgramView } | null>;
  saveIdempotency?(tenantId: string, actorUserId: string, key: string, requestHash: string, response: ProgramView): Promise<void>;
}

const PROGRAM_STATUSES: readonly ProgramStatus[] = ['draft', 'active', 'paused', 'completed', 'archived'];

function validDate(value: string, label: string): string {
  const date = new Date(value);
  if (!value.trim() || Number.isNaN(date.getTime())) throw new ApiError(400, 'VALIDATION_ERROR', `${label} must be a valid date.`);
  return date.toISOString();
}

function validatedProgram(input: CreateProgramInput): Omit<CreateProgramInput, 'status'> & { status: ProgramStatus } {
  const name = input.name.trim();
  if (!name || name.length > 200) throw new ApiError(400, 'VALIDATION_ERROR', 'Program name is required.');
  if (!input.destinationCityId.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Destination city is required.');
  const startsAt = validDate(input.startsAt, 'Program start');
  const endsAt = validDate(input.endsAt, 'Program end');
  if (new Date(endsAt) <= new Date(startsAt)) throw new ApiError(400, 'VALIDATION_ERROR', 'Program end must be after program start.');
  const status = input.status ?? 'draft';
  if (!PROGRAM_STATUSES.includes(status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Program status is invalid.');
  return { name, destinationCityId: input.destinationCityId.trim(), startsAt, endsAt, status };
}

function hashInput(input: CreateProgramInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function makeProgramService({ repository }: { repository: ProgramRepository }) {
  return {
    async listPrograms(identity: IdentityContext, input: { page?: number; pageSize?: number } = {}): Promise<ProgramPage> {
      const { tenantId } = tenantForHr(identity);
      const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
      const pageSize = Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0 ? Math.min(input.pageSize!, 100) : 20;
      const result = await repository.listPrograms(tenantId, { page, pageSize });
      return { ...result, page, pageSize, totalPages: Math.max(1, Math.ceil(result.total / pageSize)) };
    },

    async createProgram(identity: IdentityContext, input: CreateProgramInput, idempotencyKey: string): Promise<ProgramView> {
      const { tenantId, userId } = tenantForHr(identity);
      if (!idempotencyKey || idempotencyKey.length < 8) throw new ApiError(400, 'VALIDATION_ERROR', 'A valid idempotency key is required.');
      const normalized = validatedProgram(input);
      const hash = hashInput(normalized);
      const cached = await repository.findIdempotency?.(tenantId, userId, idempotencyKey);
      if (cached) {
        if (cached.requestHash !== hash) throw new ApiError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'The idempotency key was used for a different program.');
        return cached.response;
      }
      const result = await repository.createProgram({ ...normalized, tenantId, createdBy: userId });
      await repository.saveIdempotency?.(tenantId, userId, idempotencyKey, hash, result);
      return result;
    },

    async updateProgram(identity: IdentityContext, programId: string, patch: UpdateProgramPatch): Promise<ProgramView> {
      const { tenantId } = tenantForHr(identity);
      const normalized: UpdateProgramPatch = { ...patch };
      if (normalized.name !== undefined && (!normalized.name.trim() || normalized.name.trim().length > 200)) throw new ApiError(400, 'VALIDATION_ERROR', 'Program name is invalid.');
      if (normalized.status !== undefined && !PROGRAM_STATUSES.includes(normalized.status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Program status is invalid.');
      if (normalized.startsAt !== undefined) normalized.startsAt = validDate(normalized.startsAt, 'Program start');
      if (normalized.endsAt !== undefined) normalized.endsAt = validDate(normalized.endsAt, 'Program end');
      if (normalized.startsAt && normalized.endsAt && new Date(normalized.endsAt) <= new Date(normalized.startsAt)) throw new ApiError(400, 'VALIDATION_ERROR', 'Program end must be after program start.');
      const result = await repository.updateProgram(tenantId, programId, normalized);
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The program was not found.');
      return result;
    },
  };
}

export type ProgramService = ReturnType<typeof makeProgramService>;
