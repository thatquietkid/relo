import { request } from './base';

export interface DirectoryEntry {
  id: string;
  cityId?: string;
  cityName: string;
  category: string;
  providerName: string;
  providerSummary: string;
  title: string;
  description: string;
  sourceUrl?: string | null;
}

export interface RequestConsentField {
  field: string;
  label: string;
  value: string;
  required: true;
}

export interface ProviderRequestPreview {
  entry: DirectoryEntry;
  destination: { cityId: string; cityName: string; moveDate: string };
  fields: RequestConsentField[];
}

export interface ProviderRequest {
  id: string;
  entryId: string;
  status: string;
  submittedAt: string | null;
  withdrawnAt: string | null;
  entry: DirectoryEntry;
}

export interface ReviewEntry {
  id: string;
  providerId: string;
  cityId: string;
  cityName: string;
  category: string;
  providerName: string;
  title: string;
  description: string;
  sourceUrl: string | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  expiresAt: string | null;
  updatedAt: string;
}

export const getDirectory = (
  accessToken: string,
  filters: { cityId: string; query?: string; category?: string; page?: number; pageSize?: number }
) => {
  const params = new URLSearchParams({
    cityId: filters.cityId,
    page: String(filters.page ?? 1),
    pageSize: String(filters.pageSize ?? 20),
  });
  if (filters.query) params.set('query', filters.query);
  if (filters.category) params.set('category', filters.category);
  return request<{
    items: DirectoryEntry[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(`/api/v1/directory?${params}`, {}, accessToken);
};

export const getShortlist = (accessToken: string) =>
  request<{ shortlist: Array<{ id: string; directoryEntryId: string; entry: DirectoryEntry }> }>(
    '/api/v1/me/shortlist',
    {},
    accessToken
  );

export const saveShortlist = (accessToken: string, entryId: string) =>
  request<{ shortlist: unknown }>(
    '/api/v1/me/shortlist',
    { method: 'POST', body: JSON.stringify({ entryId }) },
    accessToken
  );

export const removeShortlist = (accessToken: string, entryId: string) =>
  request<void>(`/api/v1/me/shortlist/${encodeURIComponent(entryId)}`, { method: 'DELETE' }, accessToken);

export const getProviderRequestPreview = (accessToken: string, entryId: string) =>
  request<{ preview: ProviderRequestPreview }>(
    '/api/v1/me/provider-requests/preview',
    { method: 'POST', body: JSON.stringify({ entryId }) },
    accessToken
  );

export const submitProviderRequest = (
  accessToken: string,
  input: { entryId: string; consents: Array<{ field: string; consented: boolean }> },
  idempotencyKey: string
) =>
  request<{ request: ProviderRequest }>(
    '/api/v1/me/provider-requests',
    {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    },
    accessToken
  );

export const getProviderRequests = (accessToken: string) =>
  request<{ requests: ProviderRequest[] }>('/api/v1/me/provider-requests', {}, accessToken);

export const withdrawProviderRequest = (accessToken: string, requestId: string) =>
  request<{ request: ProviderRequest }>(
    `/api/v1/me/provider-requests/${encodeURIComponent(requestId)}/withdraw`,
    { method: 'POST' },
    accessToken
  );

export const getReviewQueue = (accessToken: string, status = 'draft') =>
  request<{
    items: ReviewEntry[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  }>(`/api/v1/review/queue?status=${encodeURIComponent(status)}`, {}, accessToken);

export const publishReviewEntry = (accessToken: string, id: string) =>
  request<{ entry: ReviewEntry }>(
    `/api/v1/review/directory/${encodeURIComponent(id)}/publish`,
    { method: 'POST' },
    accessToken
  );

export const unpublishReviewEntry = (accessToken: string, id: string, reason: string) =>
  request<{ entry: ReviewEntry }>(
    `/api/v1/review/directory/${encodeURIComponent(id)}/unpublish`,
    { method: 'POST', body: JSON.stringify({ reason }) },
    accessToken
  );

export const getReviewerSettings = (accessToken: string) =>
  request<{
    settings: {
      cityIds: string[];
      categories: string[];
      timezone: string;
      channels: { email: boolean; inApp: boolean };
    };
  }>('/api/v1/review/settings', {}, accessToken);
