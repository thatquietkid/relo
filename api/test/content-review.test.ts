import { describe, expect, it } from 'vitest';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';
import { makeContentReviewService, type ReviewRepository, type ReviewItem, type ReviewerSettings } from '../src/review/content-service.js';

const membership: MembershipView = {
  id: 'membership-reviewer', tenant_id: 'tenant-a', user_id: 'reviewer-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-reviewer', key: 'reviewer' }],
};
const reviewer: IdentityContext = { user: { id: 'reviewer-a', email: 'reviewer@example.com' }, memberships: [membership] };

const draft: ReviewItem = {
  id: 'entry-1', providerId: 'provider-1', cityId: 'city-blr', cityName: 'Bengaluru', category: 'housing',
  providerName: 'Safe Homes', title: 'Housing guide', description: 'A trusted guide.', sourceUrl: null,
  status: 'draft', publishedAt: null, expiresAt: null, updatedAt: '2026-09-29T00:00:00.000Z',
};

class InMemoryReviewRepository implements ReviewRepository {
  entry = draft;
  settings: ReviewerSettings = { cityIds: ['city-blr'], categories: ['housing'], timezone: 'Asia/Kolkata', channels: { email: true, inApp: true } };
  async getScope() { return { cityIds: this.settings.cityIds, categories: this.settings.categories }; }
  async listQueue() { return { items: [this.entry], total: 1 }; }
  async getEntry() { return this.entry; }
  async saveDraft(input: Parameters<ReviewRepository['saveDraft']>[0]) { this.entry = { ...this.entry, ...input, id: 'entry-1' }; return this.entry; }
  async updateEntry(_id: string, patch: Parameters<ReviewRepository['updateEntry']>[1]) { this.entry = { ...this.entry, ...patch }; return this.entry; }
  async publishEntry() { this.entry = { ...this.entry, status: 'published', publishedAt: '2026-09-29T12:00:00.000Z' }; return this.entry; }
  async unpublishEntry() { this.entry = { ...this.entry, status: 'archived' }; return this.entry; }
  async getSettings() { return this.settings; }
  async updateSettings(_userId: string, patch: Parameters<ReviewRepository['updateSettings']>[1]) { this.settings = { ...this.settings, ...patch, channels: { ...this.settings.channels, ...(patch.channels ?? {}) } }; return this.settings; }
}

describe('content review', () => {
  it('requires provenance and expiry before publication', async () => {
    const service = makeContentReviewService({ repository: new InMemoryReviewRepository(), now: () => new Date('2026-09-29T00:00:00.000Z') });
    await expect(service.publishEntry(reviewer, 'entry-1')).rejects.toMatchObject({ code: 'PUBLICATION_REQUIREMENTS_MISSING' });
  });

  it('denies a reviewer outside the assigned city and category', async () => {
    const repo = new InMemoryReviewRepository();
    repo.entry = { ...repo.entry, cityId: 'city-delhi' };
    const service = makeContentReviewService({ repository: repo });
    await expect(service.publishEntry(reviewer, 'entry-1')).rejects.toMatchObject({ code: 'REVIEW_SCOPE_DENIED' });
  });

  it('publishes an eligible entry and preserves reviewer settings', async () => {
    const repo = new InMemoryReviewRepository();
    repo.entry = { ...repo.entry, sourceUrl: 'https://example.com/source', expiresAt: '2026-12-01T00:00:00.000Z' };
    const service = makeContentReviewService({ repository: repo, now: () => new Date('2026-09-29T00:00:00.000Z') });
    const result = await service.publishEntry(reviewer, 'entry-1');
    expect(result.status).toBe('published');
    const settings = await service.updateReviewerSettings(reviewer, { channels: { email: false } });
    expect(settings.channels).toEqual({ email: false, inApp: true });
  });
});
