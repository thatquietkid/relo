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
