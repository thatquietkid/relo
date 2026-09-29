import type { ApiErrorResponse } from '@relo/contracts/http';
import type { PlatformAuthorizationSummary } from '@relo/contracts/auth';

export interface WebSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  expiresIn: number | null;
  tokenType: string;
}

export interface WebRole { id: string; key: string }
export interface WebMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  status: string;
  joined_at: string;
  suspended_at: string | null;
  tenant: { id: string; name: string; slug: string; status: string };
  roles: WebRole[];
}
export interface WebIdentity {
  user: { id: string; email: string | null };
  memberships: WebMembership[];
  platformScope?: boolean;
  platformRoles?: string[];
  platformAuthorization?: PlatformAuthorizationSummary;
}

export interface AuthorizationDetails {
  authorization_id: string;
  client: { name: string; uri?: string };
  redirect_uri?: string;
  scope?: string;
}

export interface AlreadyHandledAuthorization {
  alreadyHandled: true;
  redirectUrl: string;
}

export type AuthorizationResult = AuthorizationDetails | AlreadyHandledAuthorization;

export interface ApiFailure extends Error {
  response: ApiErrorResponse;
  status: number;
}

const apiUrl = (): string => {
  const configured = import.meta.env.VITE_RELO_API_URL as string | undefined;
  return (configured ?? '').replace(/\/$/, '');
};

function failure(response: ApiErrorResponse, status: number): ApiFailure {
  const error = new Error(response.error.message) as ApiFailure;
  error.name = 'ApiFailure';
  error.response = response;
  error.status = status;
  return error;
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, { ...init, headers });
  } catch {
    throw failure({ error: { code: 'NETWORK_ERROR', message: 'The Relo service is unavailable.', requestId: 'browser' } }, 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorResponse = payload as ApiErrorResponse;
    throw failure(errorResponse.error ? errorResponse : {
      error: { code: 'API_ERROR', message: 'The Relo service returned an error.', requestId: 'browser' },
    }, response.status);
  }
  return payload as T;
}

export const requestOtp = (email: string) => request<{ accepted: true }>('/api/v1/auth/otp/request', {
  method: 'POST', body: JSON.stringify({ email }),
});

export const verifyOtp = (email: string, token: string) => request<{ session: WebSession; identity: WebIdentity }>('/api/v1/auth/otp/verify', {
  method: 'POST', body: JSON.stringify({ email, token }),
});

export type DemoPortal = 'employee' | 'hr' | 'admin';
export const signInToDemoPortal = (portal: DemoPortal) => request<{ session: WebSession; identity: WebIdentity }>('/api/v1/auth/demo', {
  method: 'POST', body: JSON.stringify({ portal }),
});

export const startGoogleSignIn = async (redirectTo = `${window.location.origin}/auth/callback`) => {
  const result = await request<{ url: string }>(`/api/v1/auth/google/start?redirect_to=${encodeURIComponent(redirectTo)}`);
  return result;
};

export const getCurrentIdentity = (accessToken: string) => request<WebIdentity>('/api/v1/auth/me', {}, accessToken);

export const logout = (accessToken: string) => request<{ signedOut: true }>('/api/v1/auth/logout', { method: 'POST' }, accessToken);

export const acceptInvitation = (token: string, accessToken: string) => request<{ membership: WebMembership }>(`/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
  method: 'POST',
}, accessToken);

export const getOAuthDetails = (authorizationId: string, accessToken: string) => request<{ authorization: AuthorizationResult }>(
  `/api/v1/oauth/authorization-details?authorization_id=${encodeURIComponent(authorizationId)}`,
  {}, accessToken,
).then((result) => result.authorization);

export const approveOAuth = (authorizationId: string, accessToken: string) => request<{ redirectUrl: string }>('/api/v1/oauth/approve', {
  method: 'POST', body: JSON.stringify({ authorizationId }),
}, accessToken);

export const denyOAuth = (authorizationId: string, accessToken: string) => request<{ redirectUrl: string }>('/api/v1/oauth/deny', {
  method: 'POST', body: JSON.stringify({ authorizationId }),
}, accessToken);

export interface EmployeeCase {
  id: string;
  destination_city_id: string;
  destination_city_name?: string | null;
  move_date: string;
  status: string;
  progress_percent: number;
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string | null;
  state: 'pending' | 'in_progress' | 'completed' | 'skipped';
  due_at?: string | null;
  completed_at?: string | null;
}

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

export interface NotificationView {
  id: string;
  kind: string;
  title: string;
  body: string;
  readAt: string | null;
  deliveryStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface PreferencesView {
  timezone: string;
  channels: { email: boolean; inApp: boolean; push: boolean };
  privacy: { shareContact: boolean };
  updatedAt: string;
}

export const getEmployeeCase = (accessToken: string) => request<{ relocation: EmployeeCase }>('/api/v1/me/relocation', {}, accessToken);
export const getEmployeeChecklist = (accessToken: string) => request<{ checklist: ChecklistItem[] }>('/api/v1/me/relocation/checklist', {}, accessToken);
export const updateChecklistItem = (accessToken: string, itemId: string, state: ChecklistItem['state'], idempotencyKey: string) => request<{ checklist_item: ChecklistItem }>(`/api/v1/me/relocation/checklist/${encodeURIComponent(itemId)}`, { method: 'PATCH', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ state }) }, accessToken);

export const getDirectory = (accessToken: string, filters: { cityId: string; query?: string; category?: string; page?: number; pageSize?: number }) => {
  const params = new URLSearchParams({ cityId: filters.cityId, page: String(filters.page ?? 1), pageSize: String(filters.pageSize ?? 20) });
  if (filters.query) params.set('query', filters.query);
  if (filters.category) params.set('category', filters.category);
  return request<{ items: DirectoryEntry[]; page: number; pageSize: number; total: number; totalPages: number }>(`/api/v1/directory?${params}`, {}, accessToken);
};
export const getShortlist = (accessToken: string) => request<{ shortlist: Array<{ id: string; directoryEntryId: string; entry: DirectoryEntry }> }>('/api/v1/me/shortlist', {}, accessToken);
export const saveShortlist = (accessToken: string, entryId: string) => request<{ shortlist: unknown }>('/api/v1/me/shortlist', { method: 'POST', body: JSON.stringify({ entryId }) }, accessToken);
export const removeShortlist = (accessToken: string, entryId: string) => request<void>(`/api/v1/me/shortlist/${encodeURIComponent(entryId)}`, { method: 'DELETE' }, accessToken);

export interface RequestConsentField { field: string; label: string; value: string; required: true }
export interface ProviderRequestPreview { entry: DirectoryEntry; destination: { cityId: string; cityName: string; moveDate: string }; fields: RequestConsentField[] }
export interface ProviderRequest { id: string; entryId: string; status: string; submittedAt: string | null; withdrawnAt: string | null; entry: DirectoryEntry }
export const getProviderRequestPreview = (accessToken: string, entryId: string) => request<{ preview: ProviderRequestPreview }>('/api/v1/me/provider-requests/preview', { method: 'POST', body: JSON.stringify({ entryId }) }, accessToken);
export const submitProviderRequest = (accessToken: string, input: { entryId: string; consents: Array<{ field: string; consented: boolean }> }, idempotencyKey: string) => request<{ request: ProviderRequest }>('/api/v1/me/provider-requests', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }, accessToken);
export const getProviderRequests = (accessToken: string) => request<{ requests: ProviderRequest[] }>('/api/v1/me/provider-requests', {}, accessToken);
export const withdrawProviderRequest = (accessToken: string, requestId: string) => request<{ request: ProviderRequest }>(`/api/v1/me/provider-requests/${encodeURIComponent(requestId)}/withdraw`, { method: 'POST' }, accessToken);

export const getNotifications = (accessToken: string) => request<{ items: NotificationView[]; unreadCount: number; page: number; pageSize: number; total: number; totalPages: number }>('/api/v1/me/notifications?page=1&pageSize=20', {}, accessToken);
export const markNotificationRead = (accessToken: string, notificationId: string) => request<void>(`/api/v1/me/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST' }, accessToken);
export const getPreferences = (accessToken: string) => request<{ preferences: PreferencesView }>('/api/v1/me/preferences', {}, accessToken);
export const updatePreferences = (accessToken: string, patch: { timezone?: string; email?: boolean; inApp?: boolean; push?: boolean; shareContact?: boolean }) => request<{ preferences: PreferencesView }>('/api/v1/me/preferences', { method: 'PATCH', body: JSON.stringify(patch) }, accessToken);

export interface AaarrrMetric { key: string; label: string; numerator: number; denominator: number; rate: number; status: 'ok' | 'no_data'; sourceEvents: string[] }
export interface AaarrrReport { from: string; to: string; generatedAt: string; metrics: Record<string, AaarrrMetric>; activation: AaarrrMetric; acquisition: AaarrrMetric; retention: AaarrrMetric; referral: AaarrrMetric; revenue: AaarrrMetric }
export const getAaarrrReport = (accessToken: string, from: string, to: string) => request<{ report: AaarrrReport }>(`/api/v1/hr/reports/aarrr?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {}, accessToken);
export const requestReportExport = (accessToken: string, from: string, to: string, idempotencyKey: string) => request<{ export: { id: string; status: string; requestedAt: string } }>('/api/v1/hr/reports/exports', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ from, to }) }, accessToken);
export interface HrEmployeeSummary { membershipId: string; userId: string; email: string; name: string | null; status: string; joinedAt: string; roles: string[] }
export interface HrInvitation { id: string; tenantId: string; email: string; role: 'employee' | 'hr'; status: 'pending' | 'accepted' | 'expired' | 'revoked'; expiresAt: string; acceptedAt: string | null; invitedBy: string | null; createdAt: string; inviteUrl?: string }
export const getHrEmployees = (accessToken: string) => request<{ items: HrEmployeeSummary[]; page: number; pageSize: number; total: number; totalPages: number }>('/api/v1/hr/employees?page=1&pageSize=100', {}, accessToken);
export const createHrInvitation = (accessToken: string, input: { email: string; role: 'employee' | 'hr' }, idempotencyKey: string) => request<{ invitation: HrInvitation }>('/api/v1/hr/invitations', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input) }, accessToken);
export interface ReviewEntry { id: string; providerId: string; cityId: string; cityName: string; category: string; providerName: string; title: string; description: string; sourceUrl: string | null; status: 'draft' | 'published' | 'archived'; publishedAt: string | null; expiresAt: string | null; updatedAt: string }
export const getReviewQueue = (accessToken: string, status = 'draft') => request<{ items: ReviewEntry[]; page: number; pageSize: number; total: number; totalPages: number }>(`/api/v1/review/queue?status=${encodeURIComponent(status)}`, {}, accessToken);
export const publishReviewEntry = (accessToken: string, id: string) => request<{ entry: ReviewEntry }>(`/api/v1/review/directory/${encodeURIComponent(id)}/publish`, { method: 'POST' }, accessToken);
export const unpublishReviewEntry = (accessToken: string, id: string, reason: string) => request<{ entry: ReviewEntry }>(`/api/v1/review/directory/${encodeURIComponent(id)}/unpublish`, { method: 'POST', body: JSON.stringify({ reason }) }, accessToken);
export const getReviewerSettings = (accessToken: string) => request<{ settings: { cityIds: string[]; categories: string[]; timezone: string; channels: { email: boolean; inApp: boolean } } }>('/api/v1/review/settings', {}, accessToken);
export interface AdminEvent { id: string; action: string; resourceType: string; resourceId: string | null; createdAt: string; metadata: Record<string, unknown> }
export const getAdminEvents = (accessToken: string, filters: { resourceType?: string } = {}) => {
  const params = new URLSearchParams({ page: '1', pageSize: '50' });
  if (filters.resourceType) params.set('resourceType', filters.resourceType);
  return request<{ items: AdminEvent[]; total: number }>(`/api/v1/admin/events?${params.toString()}`, {}, accessToken);
};
