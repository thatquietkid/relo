import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { makeDirectoryService } from '../src/directory/directory-service.js';
import type { DirectoryEntryRecord, DirectoryEvent, DirectoryRepository, DirectorySearchResult, ShortlistItemRecord } from '../src/directory/types.js';
import type { AuthService } from '../src/identity/auth-service.js';
import type { IdentityContext } from '../src/identity/types.js';
import type { MembershipView } from '../src/tenancy/types.js';

const now = new Date('2026-09-29T12:00:00.000Z');
const employeeMembership: MembershipView = {
  id: 'membership-a', tenant_id: 'tenant-a', user_id: 'employee-a', status: 'active',
  joined_at: '2026-09-01T00:00:00.000Z', suspended_at: null,
  tenant: { id: 'tenant-a', name: 'Acme', slug: 'acme', status: 'active' },
  roles: [{ id: 'role-employee', key: 'employee' }],
};
const employee: IdentityContext = {
  user: { id: 'employee-a', email: 'employee@example.com' },
  memberships: [employeeMembership],
};

function entry(overrides: Partial<DirectoryEntryRecord> = {}): DirectoryEntryRecord {
  return {
    id: 'entry-1', cityId: 'blr', cityName: 'Bengaluru', category: 'housing', providerName: 'Safe Homes',
    providerSummary: 'Trusted housing support.', title: 'Bengaluru housing guide', description: 'A practical guide for finding a home.',
    sourceUrl: 'https://directory.example/housing', publishedAt: '2026-09-01T00:00:00.000Z', expiresAt: '2026-10-01T00:00:00.000Z', status: 'published', ...overrides,
  };
}

class InMemoryDirectoryRepository implements DirectoryRepository {
  entries: DirectoryEntryRecord[] = [
    entry(),
    entry({ id: 'entry-2', title: 'Expired home guide', expiresAt: '2026-09-28T00:00:00.000Z' }),
    entry({ id: 'entry-3', status: 'draft', title: 'Draft guide' }),
    entry({ id: 'entry-4', cityId: 'del', cityName: 'Delhi', title: 'Delhi housing guide' }),
    entry({ id: 'entry-5', category: 'schools', providerName: 'Learning Places', title: 'Bengaluru schools guide' }),
  ];
  shortlist: ShortlistItemRecord[] = [];
  events: DirectoryEvent[] = [];

  async search(input: Parameters<DirectoryRepository['search']>[0]): Promise<DirectorySearchResult> {
    const query = input.query?.trim().toLocaleLowerCase() ?? '';
    const filtered = this.entries
      .filter((candidate) => candidate.cityId === input.cityId)
      .filter((candidate) => candidate.status === 'published')
      .filter((candidate) => candidate.publishedAt !== null && new Date(candidate.publishedAt) <= now)
      .filter((candidate) => candidate.expiresAt === null || new Date(candidate.expiresAt) > now)
      .filter((candidate) => !input.category || candidate.category === input.category)
      .filter((candidate) => !query || `${candidate.title} ${candidate.description} ${candidate.providerName}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => left.publishedAt!.localeCompare(right.publishedAt!) || left.id.localeCompare(right.id));
    const start = (input.page - 1) * input.pageSize;
    return { items: filtered.slice(start, start + input.pageSize), total: filtered.length };
  }

  async getById(id: string): Promise<DirectoryEntryRecord | null> {
    const candidate = this.entries.find((item) => item.id === id);
    if (!candidate || candidate.status !== 'published' || !candidate.publishedAt || new Date(candidate.publishedAt) > now || (candidate.expiresAt !== null && new Date(candidate.expiresAt) <= now)) return null;
    return candidate;
  }
  async listShortlist(userId: string): Promise<ShortlistItemRecord[]> { return this.shortlist.filter((item) => item.userId === userId); }
  async saveShortlist(userId: string, entryId: string): Promise<{ item: ShortlistItemRecord; created: boolean }> {
    const existing = this.shortlist.find((item) => item.userId === userId && item.directoryEntryId === entryId);
    if (existing) return { item: existing, created: false };
    const item = { id: `shortlist-${this.shortlist.length + 1}`, userId, directoryEntryId: entryId, note: null, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    this.shortlist.push(item);
    return { item, created: true };
  }
  async removeShortlist(userId: string, entryId: string): Promise<{ removed: boolean }> {
    const before = this.shortlist.length;
    this.shortlist = this.shortlist.filter((item) => !(item.userId === userId && item.directoryEntryId === entryId));
    return { removed: this.shortlist.length !== before };
  }
  async appendEvent(event: DirectoryEvent): Promise<void> { this.events.push(event); }
}

function authServiceFor(identity = employee): AuthService {
  return {
    requestEmailOtp: async () => ({ accepted: true }),
    verifyEmailOtp: async () => { throw new Error('unused'); },
    getGoogleSignInUrl: async () => 'https://accounts.google.com',
    getCurrentIdentity: async () => identity,
    logout: async () => ({ signedOut: true }),
  };
}

describe('directory search and shortlist service', () => {
  it('returns only published, non-expired entries for the requested city', async () => {
    const repository = new InMemoryDirectoryRepository();
    const service = makeDirectoryService({ repository, now: () => now });
    const result = await service.searchDirectory({ cityId: 'blr', page: 1, pageSize: 20 });
    expect(result.items.map((item) => item.id)).toEqual(['entry-1', 'entry-5']);
    expect(result.items.every((item) => item.status === 'published')).toBe(true);
    expect(result.items.every((item) => item.expiresAt === null || new Date(item.expiresAt) > now)).toBe(true);
  });

  it('normalizes search, rejects unknown categories, and caps page size', async () => {
    const repository = new InMemoryDirectoryRepository();
    const service = makeDirectoryService({ repository, now: () => now });
    await expect(service.searchDirectory({ cityId: 'blr', query: '  SAFE   HOMES ', page: 1, pageSize: 999 })).resolves.toMatchObject({ pageSize: 50, items: [expect.objectContaining({ id: 'entry-1' })] });
    await expect(service.searchDirectory({ cityId: 'blr', category: 'unknown', page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(service.searchDirectory({ cityId: 'blr', query: 'safe,%homes', page: 1, pageSize: 20 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('does not expose provider contact fields in entry views', async () => {
    const repository = new InMemoryDirectoryRepository();
    const service = makeDirectoryService({ repository, now: () => now });
    const result = await service.getDirectoryEntry('entry-1');
    expect(result).not.toHaveProperty('providerEmail');
    expect(result).not.toHaveProperty('providerPhone');
    expect(result).toMatchObject({ id: 'entry-1', providerName: 'Safe Homes' });
  });

  it('saves a shortlist entry idempotently and emits one state-change event', async () => {
    const repository = new InMemoryDirectoryRepository();
    const service = makeDirectoryService({ repository, now: () => now });
    await service.saveDirectoryEntry(employee, 'entry-1', 'trace-save');
    await service.saveDirectoryEntry(employee, 'entry-1', 'trace-save-replay');
    expect(repository.shortlist).toHaveLength(1);
    expect(repository.events.filter((event) => event.type === 'DirectoryEntrySaved')).toHaveLength(1);
  });

  it('requires an employee role, keeps shortlist private, and emits unsaved only on a state change', async () => {
    const repository = new InMemoryDirectoryRepository();
    const service = makeDirectoryService({ repository, now: () => now });
    await service.saveDirectoryEntry(employee, 'entry-1');
    await expect(service.listShortlist({ ...employee, user: { ...employee.user, id: 'employee-b' }, memberships: [{ ...employeeMembership, user_id: 'employee-b' }] })).resolves.toEqual([]);
    await service.removeDirectoryEntry(employee, 'entry-1', 'trace-remove');
    await service.removeDirectoryEntry(employee, 'entry-1', 'trace-remove-replay');
    expect(repository.events.filter((event) => event.type === 'DirectoryEntryUnsaved')).toHaveLength(1);
    await expect(service.saveDirectoryEntry({ ...employee, memberships: [{ ...employeeMembership, roles: [{ id: 'role-hr', key: 'hr' }] }] }, 'entry-1')).rejects.toMatchObject({ code: 'ROLE_REQUIRED' });
  });
});

describe('directory routes', () => {
  it('registers directory and shortlist routes with request IDs and safe errors', async () => {
    const repository = new InMemoryDirectoryRepository();
    const app = createApp({ logger: false }, { authService: authServiceFor(), directoryRepository: repository });
    const list = await app.inject({ method: 'GET', url: '/api/v1/directory?cityId=blr&page=1&pageSize=20', headers: { authorization: 'Bearer employee-token' } });
    expect(list.statusCode).toBe(200);
    expect(list.headers['x-request-id']).toEqual(expect.any(String));
    expect(list.json().items).toHaveLength(2);
    const invalid = await app.inject({ method: 'GET', url: '/api/v1/directory?cityId=blr&category=unknown&page=1&pageSize=20', headers: { authorization: 'Bearer employee-token' } });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toMatchObject({ code: 'VALIDATION_ERROR', requestId: expect.any(String) });
    const saved = await app.inject({ method: 'POST', url: '/api/v1/me/shortlist', headers: { authorization: 'Bearer employee-token' }, payload: { entryId: 'entry-1' } });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ shortlist: { directoryEntryId: 'entry-1' } });
    const removed = await app.inject({ method: 'DELETE', url: '/api/v1/me/shortlist/entry-1', headers: { authorization: 'Bearer employee-token' } });
    expect(removed.statusCode).toBe(204);
    await app.close();
  });
});
