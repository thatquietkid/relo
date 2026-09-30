import type { PlatformAuthorizationSummary } from '@relo/contracts/auth';
import { request } from './base';

export interface WebSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  expiresIn: number | null;
  tokenType: string;
}

export interface WebRole {
  id: string;
  key: string;
}

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

export type DemoPortal = 'employee' | 'hr' | 'admin';

export const requestOtp = (email: string) =>
  request<{ accepted: true }>('/api/v1/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

export const verifyOtp = (email: string, token: string) =>
  request<{ session: WebSession; identity: WebIdentity }>('/api/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({ email, token }),
  });

export const signInToDemoPortal = (portal: DemoPortal) =>
  request<{ session: WebSession; identity: WebIdentity }>('/api/v1/auth/demo', {
    method: 'POST',
    body: JSON.stringify({ portal }),
  });

export const startGoogleSignIn = async (redirectTo = `${window.location.origin}/auth/callback`) => {
  const result = await request<{ url: string }>(
    `/api/v1/auth/google/start?redirect_to=${encodeURIComponent(redirectTo)}`
  );
  return result;
};

export const getCurrentIdentity = (accessToken: string) =>
  request<WebIdentity>('/api/v1/auth/me', {}, accessToken);

export const logout = (accessToken: string) =>
  request<{ signedOut: true }>('/api/v1/auth/logout', { method: 'POST' }, accessToken);

export const acceptInvitation = (token: string, accessToken: string) =>
  request<{ membership: WebMembership }>(
    `/api/v1/invitations/${encodeURIComponent(token)}/accept`,
    { method: 'POST' },
    accessToken
  );

export const getOAuthDetails = (authorizationId: string, accessToken: string) =>
  request<{ authorization: AuthorizationResult }>(
    `/api/v1/oauth/authorization-details?authorization_id=${encodeURIComponent(authorizationId)}`,
    {},
    accessToken
  ).then((result) => result.authorization);

export const approveOAuth = (authorizationId: string, accessToken: string) =>
  request<{ redirectUrl: string }>(
    '/api/v1/oauth/approve',
    { method: 'POST', body: JSON.stringify({ authorizationId }) },
    accessToken
  );

export const denyOAuth = (authorizationId: string, accessToken: string) =>
  request<{ redirectUrl: string }>(
    '/api/v1/oauth/deny',
    { method: 'POST', body: JSON.stringify({ authorizationId }) },
    accessToken
  );
