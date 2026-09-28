import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import { ApiError } from '../shared/errors.js';
import type { DirectoryEntryRecord, DirectoryEvent, DirectoryRepository, DirectorySearchInput, ShortlistItemRecord } from './types.js';

function unavailable(): ApiError { return new ApiError(503, 'DIRECTORY_DATA_UNAVAILABLE', 'Directory data is unavailable.'); }

function mapEntry(value: unknown): DirectoryEntryRecord {
  if (!value || typeof value !== 'object') throw unavailable();
  const row = value as Record<string, any>;
  const provider = Array.isArray(row.providers) ? row.providers[0] : row.providers ?? {};
  const city = Array.isArray(provider.cities) ? provider.cities[0] : provider.cities ?? {};
  return {
    id: String(row.id), cityId: String(city.id ?? provider.city_id ?? ''), cityName: String(city.name ?? ''), category: String(provider.category ?? ''), providerName: String(provider.name ?? ''), providerSummary: String(provider.summary ?? ''), title: String(row.title), description: String(row.description), sourceUrl: typeof row.source_url === 'string' ? row.source_url : null, publishedAt: typeof row.published_at === 'string' ? row.published_at : null, expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null, status: row.status as DirectoryEntryRecord['status'],
  };
}

function mapShortlist(value: unknown): ShortlistItemRecord {
  if (!value || typeof value !== 'object') throw unavailable();
  const row = value as Record<string, unknown>;
  return { id: String(row.id), userId: String(row.user_id), directoryEntryId: String(row.directory_entry_id), note: typeof row.note === 'string' ? row.note : null, createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}

export function makeSupabaseDirectoryRepository(client: ReturnType<typeof createSupabaseClient>): DirectoryRepository {
  const selection = 'id, provider_id, title, description, source_url, published_at, expires_at, status, providers!inner(id, city_id, category, name, summary, contact_policy, cities!inner(id, name, slug))';
  return {
    async getDestinationCity(userId, tenantId) {
      const result = await client.from('relocation_cases').select('destination_city_id').eq('employee_user_id', userId).eq('tenant_id', tenantId).neq('status', 'cancelled').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw unavailable();
      return result.data ? String(result.data.destination_city_id) : null;
    },
    async search(input: DirectorySearchInput) {
      const now = new Date().toISOString();
      let query = client.from('directory_entries').select(selection, { count: 'exact' }).eq('status', 'published').eq('providers.city_id', input.cityId).lte('published_at', now).or(`expires_at.is.null,expires_at.gt.${now}`).order('published_at', { ascending: false }).order('id', { ascending: true });
      if (input.category) query = query.eq('providers.category', input.category);
      if (input.query) query = query.or(`title.ilike.%${input.query}%,description.ilike.%${input.query}%,providers.name.ilike.%${input.query}%`);
      const from = (input.page - 1) * input.pageSize;
      const result = await query.range(from, from + input.pageSize - 1);
      if (result.error) throw unavailable();
      return { items: (result.data ?? []).map(mapEntry), total: result.count ?? 0 };
    },
    async getById(entryId) {
      const result = await client.from('directory_entries').select(selection).eq('id', entryId).maybeSingle();
      if (result.error) throw unavailable();
      return result.data ? mapEntry(result.data) : null;
    },
    async listShortlist(userId) {
      const result = await client.from('shortlist_items').select('id, user_id, directory_entry_id, note, created_at, updated_at').eq('user_id', userId).order('created_at', { ascending: false });
      if (result.error) throw unavailable();
      return (result.data ?? []).map(mapShortlist);
    },
    async saveShortlist(userId, entryId): Promise<{ item: ShortlistItemRecord; created: boolean }> {
      const inserted = await client.from('shortlist_items').insert({ user_id: userId, directory_entry_id: entryId }).select('id, user_id, directory_entry_id, note, created_at, updated_at').maybeSingle();
      if (!inserted.error && inserted.data) return { item: mapShortlist(inserted.data), created: true };
      if (inserted.error?.code !== '23505') throw unavailable();
      const existing = await client.from('shortlist_items').select('id, user_id, directory_entry_id, note, created_at, updated_at').eq('user_id', userId).eq('directory_entry_id', entryId).single();
      if (existing.error) throw unavailable();
      return { item: mapShortlist(existing.data), created: false };
    },
    async removeShortlist(userId, entryId): Promise<{ removed: boolean }> {
      const result = await client.from('shortlist_items').delete().eq('user_id', userId).eq('directory_entry_id', entryId).select('id').maybeSingle();
      if (result.error) throw unavailable();
      return { removed: Boolean(result.data) };
    },
    async appendEvent(event: DirectoryEvent) {
      const result = await client.rpc('append_directory_event', { p_event_id: event.id, p_event_type: event.type, p_version: event.version, p_occurred_at: event.occurredAt, p_tenant_id: event.tenantId, p_actor_id: event.actorId, p_trace_id: event.traceId, p_payload: event.payload });
      if (result.error) throw unavailable();
    },
  };
}

export function createSupabaseDirectoryRepositoryFromEnv(accessToken: string): DirectoryRepository {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey || !accessToken.trim()) throw unavailable();
  const config: SupabaseClientConfig = { url, publishableKey, accessToken: accessToken.trim() };
  return makeSupabaseDirectoryRepository(createSupabaseClient(config));
}
