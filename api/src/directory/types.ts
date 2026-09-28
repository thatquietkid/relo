import type { DomainEvent } from '@relo/contracts/events';

export const DIRECTORY_CATEGORIES = ['housing', 'schools', 'healthcare', 'banking', 'transport', 'legal', 'utilities', 'community', 'childcare'] as const;
export type DirectoryCategory = (typeof DIRECTORY_CATEGORIES)[number];

export interface DirectoryEntryRecord {
  id: string;
  cityId: string;
  cityName: string;
  category: string;
  providerName: string;
  providerSummary: string;
  title: string;
  description: string;
  sourceUrl: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  status: 'draft' | 'published' | 'archived';
}

export interface DirectorySearchInput { cityId: string; category?: string; query?: string; page: number; pageSize: number; }
export interface DirectorySearchResult { items: DirectoryEntryRecord[]; total: number; }
export interface Page<T> { items: T[]; page: number; pageSize: number; total: number; totalPages: number; }
export interface ShortlistItemRecord { id: string; userId: string; directoryEntryId: string; note: string | null; createdAt: string; updatedAt: string; }
export interface ShortlistView extends Omit<ShortlistItemRecord, 'userId'> { entry: DirectoryEntryRecord; }
export type DirectoryEventType = 'DirectoryEntrySaved' | 'DirectoryEntryUnsaved';
export type DirectoryEvent = DomainEvent<Record<string, unknown>> & { type: DirectoryEventType; tenantId: string; actorId: string };

export interface DirectoryRepository {
  getDestinationCity?(userId: string, tenantId: string): Promise<string | null>;
  search(input: DirectorySearchInput): Promise<DirectorySearchResult>;
  getById(entryId: string): Promise<DirectoryEntryRecord | null>;
  listShortlist(userId: string): Promise<ShortlistItemRecord[]>;
  saveShortlist(userId: string, entryId: string, tenantId?: string): Promise<{ item: ShortlistItemRecord; created: boolean }>;
  removeShortlist(userId: string, entryId: string, tenantId?: string): Promise<{ removed: boolean }>;
  appendEvent(event: DirectoryEvent): Promise<void>;
}
