import type { IdentityContext } from '../identity/types.js';
import { ApiError } from '../shared/errors.js';

export type ReviewStatus = 'draft' | 'published' | 'archived';
export interface ReviewItem {
  id: string; providerId: string; cityId: string; cityName: string; category: string; providerName: string;
  title: string; description: string; sourceUrl: string | null; status: ReviewStatus;
  publishedAt: string | null; expiresAt: string | null; updatedAt: string;
}
export interface ReviewPage { items: ReviewItem[]; page: number; pageSize: number; total: number; totalPages: number; }
export interface ReviewerScope { cityIds: string[]; categories: string[]; }
export interface ReviewerSettings { cityIds: string[]; categories: string[]; timezone: string; channels: { email: boolean; inApp: boolean }; }
export interface ReviewerSettingsPatch { cityIds?: string[]; categories?: string[]; timezone?: string; channels?: Partial<ReviewerSettings['channels']>; }
export interface ReviewDraftInput { providerId: string; cityId: string; category: string; title: string; description: string; sourceUrl?: string | null; expiresAt?: string | null; }
export interface ReviewRepository {
  getScope(userId: string): Promise<ReviewerScope>;
  listQueue(input: { page: number; pageSize: number; status?: ReviewStatus }): Promise<{ items: ReviewItem[]; total: number }>;
  getEntry(entryId: string): Promise<ReviewItem | null>;
  saveDraft(input: ReviewDraftInput & { actorUserId: string }): Promise<ReviewItem>;
  updateEntry(entryId: string, patch: Partial<ReviewDraftInput> & { actorUserId: string }): Promise<ReviewItem | null>;
  publishEntry(entryId: string, actorUserId: string): Promise<ReviewItem | null>;
  unpublishEntry(entryId: string, actorUserId: string, reason: string): Promise<ReviewItem | null>;
  getSettings(userId: string): Promise<ReviewerSettings | null>;
  updateSettings(userId: string, patch: ReviewerSettingsPatch): Promise<ReviewerSettings>;
}

function reviewerId(identity: IdentityContext): string { return identity.user.id; }
function withinScope(entry: ReviewItem, scope: ReviewerScope): boolean {
  return scope.cityIds.includes(entry.cityId) && scope.categories.includes(entry.category);
}
function validateExpiry(value: string | null | undefined, now: Date): string {
  if (!value) throw new ApiError(400, 'PUBLICATION_REQUIREMENTS_MISSING', 'A publication expiry date is required.');
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date <= now) throw new ApiError(400, 'PUBLICATION_REQUIREMENTS_MISSING', 'Publication expiry must be in the future.');
  return date.toISOString();
}
function validateSource(sourceUrl: string | null | undefined): string {
  if (!sourceUrl) throw new ApiError(400, 'PUBLICATION_REQUIREMENTS_MISSING', 'A source URL is required before publication.');
  try { const url = new URL(sourceUrl); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); return url.toString(); }
  catch { throw new ApiError(400, 'PUBLICATION_REQUIREMENTS_MISSING', 'A valid source URL is required before publication.'); }
}

export function makeContentReviewService({ repository, now = () => new Date() }: { repository: ReviewRepository; now?: () => Date }) {
  async function scopedEntry(identity: IdentityContext, entryId: string): Promise<{ entry: ReviewItem; scope: ReviewerScope }> {
    const entry = await repository.getEntry(entryId);
    if (!entry) throw new ApiError(404, 'NOT_FOUND', 'The directory entry was not found.');
    const scope = await repository.getScope(reviewerId(identity));
    if (!withinScope(entry, scope)) throw new ApiError(403, 'REVIEW_SCOPE_DENIED', 'This entry is outside your assigned review scope.');
    return { entry, scope };
  }
  return {
    async listReviewQueue(identity: IdentityContext, input: { page?: number; pageSize?: number; status?: ReviewStatus } = {}): Promise<ReviewPage> {
      const scope = await repository.getScope(reviewerId(identity));
      const page = Number.isInteger(input.page) && (input.page ?? 0) > 0 ? input.page! : 1;
      const pageSize = Number.isInteger(input.pageSize) && (input.pageSize ?? 0) > 0 ? Math.min(input.pageSize!, 100) : 20;
      const result = await repository.listQueue({ page, pageSize, status: input.status });
      const items = result.items.filter((entry) => withinScope(entry, scope));
      return { items, total: items.length, page, pageSize, totalPages: Math.max(1, Math.ceil(items.length / pageSize)) };
    },
    async saveDraft(identity: IdentityContext, input: ReviewDraftInput): Promise<ReviewItem> {
      if (!input.title.trim() || !input.description.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Title and description are required.');
      const scope = await repository.getScope(reviewerId(identity));
      if (!scope.cityIds.includes(input.cityId) || !scope.categories.includes(input.category)) throw new ApiError(403, 'REVIEW_SCOPE_DENIED', 'This draft is outside your assigned review scope.');
      return repository.saveDraft({ ...input, actorUserId: reviewerId(identity) });
    },
    async updateDraft(identity: IdentityContext, entryId: string, patch: Partial<ReviewDraftInput>): Promise<ReviewItem> {
      await scopedEntry(identity, entryId);
      const result = await repository.updateEntry(entryId, { ...patch, actorUserId: reviewerId(identity) });
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The directory entry was not found.');
      return result;
    },
    async publishEntry(identity: IdentityContext, entryId: string): Promise<ReviewItem> {
      const { entry } = await scopedEntry(identity, entryId);
      validateSource(entry.sourceUrl);
      validateExpiry(entry.expiresAt, now());
      const result = await repository.publishEntry(entryId, reviewerId(identity));
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The directory entry was not found.');
      return result;
    },
    async unpublishEntry(identity: IdentityContext, entryId: string, reason: string): Promise<ReviewItem> {
      if (!reason.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'An unpublish reason is required.');
      await scopedEntry(identity, entryId);
      const result = await repository.unpublishEntry(entryId, reviewerId(identity), reason.trim());
      if (!result) throw new ApiError(404, 'NOT_FOUND', 'The directory entry was not found.');
      return result;
    },
    async getReviewerSettings(identity: IdentityContext): Promise<ReviewerSettings> {
      const scope = await repository.getScope(reviewerId(identity));
      return await repository.getSettings(reviewerId(identity)) ?? { ...scope, timezone: 'UTC', channels: { email: true, inApp: true } };
    },
    async updateReviewerSettings(identity: IdentityContext, patch: ReviewerSettingsPatch): Promise<ReviewerSettings> {
      const current = await this.getReviewerSettings(identity);
      const cityIds = patch.cityIds ?? current.cityIds;
      const categories = patch.categories ?? current.categories;
      const scope = await repository.getScope(reviewerId(identity));
      if (cityIds.some((city) => !scope.cityIds.includes(city)) || categories.some((category) => !scope.categories.includes(category))) throw new ApiError(403, 'REVIEW_SCOPE_DENIED', 'Reviewer settings cannot expand beyond assigned scope.');
      return repository.updateSettings(reviewerId(identity), { ...patch, cityIds, categories, channels: { ...current.channels, ...(patch.channels ?? {}) } });
    },
  };
}

export type ContentReviewService = ReturnType<typeof makeContentReviewService>;
