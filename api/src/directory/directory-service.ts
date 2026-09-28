import { randomUUID } from 'node:crypto';
import type { IdentityContext } from '../identity/types.js';
import { selectEmployeeMembership } from '../employee/checklist-service.js';
import { ApiError } from '../shared/errors.js';
import type { DirectoryEntryRecord, DirectoryEvent, DirectoryRepository, DirectorySearchInput, Page, ShortlistItemRecord } from './types.js';
import { DIRECTORY_CATEGORIES, type DirectoryCategory } from './types.js';

function validation(message: string): ApiError { return new ApiError(400, 'VALIDATION_ERROR', message); }

function normalizeQuery(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!normalized) return undefined;
  if (normalized.length > 100) throw validation('Search query must be 100 characters or fewer.');
  // Keep the value safe for the PostgREST filter grammar used by the adapter.
  // Human-readable punctuation is allowed, while filter delimiters and
  // wildcard characters are rejected instead of being interpreted as syntax.
  if (!/^[\p{L}\p{N}\s'&+./:_-]+$/u.test(normalized)) {
    throw validation('Search query contains unsupported characters.');
  }
  return normalized;
}

function assertEmployee(identity: IdentityContext) {
  const membership = selectEmployeeMembership(identity);
  return { userId: identity.user.id, tenantId: membership.tenant_id };
}

function visibleEntry(entry: DirectoryEntryRecord | null, now: Date): DirectoryEntryRecord {
  if (!entry || entry.status !== 'published' || !entry.publishedAt || new Date(entry.publishedAt) > now
    || (entry.expiresAt !== null && new Date(entry.expiresAt) <= now)) {
    throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  }
  return entry;
}

function pageOf<T>(items: T[], page: number, pageSize: number, total: number): Page<T> {
  return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}

async function assertDestination(repository: DirectoryRepository, userId: string, tenantId: string, entry: DirectoryEntryRecord): Promise<void> {
  if (!repository.getDestinationCity) return;
  const destinationCity = await repository.getDestinationCity(userId, tenantId);
  if (!destinationCity) throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
  if (destinationCity !== entry.cityId) {
    throw new ApiError(403, 'DIRECTORY_CITY_FORBIDDEN', 'Directory content is limited to your destination.');
  }
}

function event(type: DirectoryEvent['type'], tenantId: string, actorId: string, entryId: string, traceId: string): DirectoryEvent {
  return { id: randomUUID(), type, version: 1, occurredAt: new Date().toISOString(), tenantId, actorId, traceId, payload: { directory_entry_id: entryId } };
}

export function makeDirectoryService({ repository, now = () => new Date() }: { repository: DirectoryRepository; now?: () => Date }) {
  return {
    async searchDirectory(input: DirectorySearchInput): Promise<Page<DirectoryEntryRecord>> {
      const page = Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
      const pageSize = Number.isInteger(input.pageSize) && input.pageSize > 0 ? Math.min(input.pageSize, 50) : 20;
      const category = input.category?.trim().toLocaleLowerCase();
      if (category && !DIRECTORY_CATEGORIES.includes(category as DirectoryCategory)) throw validation('The directory category is not supported.');
      const result = await repository.search({ ...input, page, pageSize, category, query: normalizeQuery(input.query) });
      const items = result.items.filter((entry) => {
        try { return visibleEntry(entry, now()) === entry; } catch { return false; }
      });
      return pageOf(items, page, pageSize, result.total);
    },

    async getDirectoryEntry(entryId: string): Promise<DirectoryEntryRecord> {
      return visibleEntry(await repository.getById(entryId), now());
    },

    async listShortlist(identity: IdentityContext): Promise<Array<ShortlistItemRecord & { entry: DirectoryEntryRecord }>> {
      const { userId, tenantId } = assertEmployee(identity);
      if (repository.getDestinationCity && !(await repository.getDestinationCity(userId, tenantId))) {
        throw new ApiError(404, 'NOT_FOUND', 'The requested resource was not found.');
      }
      const rows = await repository.listShortlist(userId);
      const result: Array<ShortlistItemRecord & { entry: DirectoryEntryRecord }> = [];
      for (const row of rows) {
        const entry = await repository.getById(row.directoryEntryId);
        if (!entry) continue;
        try {
          const visible = visibleEntry(entry, now());
          await assertDestination(repository, userId, tenantId, visible);
          result.push({ ...row, entry: visible });
        } catch (error) {
          if (!(error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 404))) throw error;
        }
      }
      return result;
    },

    async saveDirectoryEntry(identity: IdentityContext, entryId: string, traceId: string = randomUUID()): Promise<ShortlistItemRecord> {
      const { userId, tenantId } = assertEmployee(identity);
      const entry = visibleEntry(await repository.getById(entryId), now());
      await assertDestination(repository, userId, tenantId, entry);
      const result = await repository.saveShortlist(userId, entryId, tenantId);
      if (result.created) await repository.appendEvent(event('DirectoryEntrySaved', tenantId, userId, entryId, traceId));
      return result.item;
    },

    async removeDirectoryEntry(identity: IdentityContext, entryId: string, traceId: string = randomUUID()): Promise<void> {
      const { userId, tenantId } = assertEmployee(identity);
      const result = await repository.removeShortlist(userId, entryId, tenantId);
      if (result.removed) await repository.appendEvent(event('DirectoryEntryUnsaved', tenantId, userId, entryId, traceId));
    },
  };
}
