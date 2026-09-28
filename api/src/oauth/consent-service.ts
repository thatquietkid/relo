import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from '../identity/types.js';
import type { SupabaseOAuthPort } from '../identity/supabase.js';

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

export type AuthorizationDetailsResult = AuthorizationDetails | AlreadyHandledAuthorization;

export interface ConsentService {
  getAuthorizationDetails(identity: IdentityContext | null, authorizationId: string): Promise<AuthorizationDetailsResult>;
  approveAuthorization(identity: IdentityContext | null, authorizationId: string): Promise<{ redirectUrl: string }>;
  denyAuthorization(identity: IdentityContext | null, authorizationId: string): Promise<{ redirectUrl: string }>;
}

interface ConsentServiceOptions {
  supabase: SupabaseOAuthPort;
}

function requireIdentity(identity: IdentityContext | null): asserts identity is IdentityContext {
  if (!identity) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  if (identity.memberships.length === 0) {
    throw new ApiError(403, 'MEMBERSHIP_REQUIRED', 'An active Relo membership is required.');
  }
  const canConsent = identity.memberships.some((membership) =>
    membership.roles.some((role) => ['employee', 'hr', 'admin'].includes(role.key)),
  );
  if (!canConsent) {
    throw new ApiError(403, 'OAUTH_CONSENT_FORBIDDEN', 'This Relo role cannot manage OAuth consent.');
  }
}

function requireAuthorizationId(authorizationId: string): void {
  if (!authorizationId.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'authorization_id is required.');
}

function providerError(): ApiError {
  return new ApiError(400, 'OAUTH_CONSENT_ERROR', 'The OAuth authorization request is invalid or expired.');
}

function toDetails(value: Record<string, unknown> | null): AuthorizationDetailsResult {
  if (typeof value?.redirect_url === 'string' && typeof value.authorization_id !== 'string') {
    return { alreadyHandled: true, redirectUrl: value.redirect_url };
  }
  const rawClient = value?.client as Record<string, unknown> | undefined;
  const clientName = typeof rawClient?.name === 'string'
    ? rawClient.name
    : typeof value?.client_name === 'string'
      ? value.client_name
      : '';
  if (!value || typeof value.authorization_id !== 'string' || !clientName) {
    throw providerError();
  }
  const clientUri = typeof rawClient?.uri === 'string'
    ? rawClient.uri
    : typeof value.client_uri === 'string'
      ? value.client_uri
      : undefined;
  const scope = typeof value.scope === 'string'
    ? value.scope
    : Array.isArray(value.scopes)
      ? value.scopes.filter((item): item is string => typeof item === 'string').join(' ')
      : undefined;
  return {
    authorization_id: value.authorization_id,
    client: { name: clientName, ...(clientUri ? { uri: clientUri } : {}) },
    ...(typeof value.redirect_uri === 'string' ? { redirect_uri: value.redirect_uri } : {}),
    ...(scope ? { scope } : {}),
  };
}

export function makeConsentService({ supabase }: ConsentServiceOptions): ConsentService {
  return {
    async getAuthorizationDetails(identity, authorizationId) {
      requireIdentity(identity);
      requireAuthorizationId(authorizationId);
      const { data, error } = await supabase.getAuthorizationDetails(authorizationId);
      if (error) throw providerError();
      return toDetails(data);
    },
    async approveAuthorization(identity, authorizationId) {
      requireIdentity(identity);
      requireAuthorizationId(authorizationId);
      const { data, error } = await supabase.approveAuthorization(authorizationId);
      if (error || !data) throw providerError();
      return { redirectUrl: data.redirect_url ?? '' };
    },
    async denyAuthorization(identity, authorizationId) {
      requireIdentity(identity);
      requireAuthorizationId(authorizationId);
      const { data, error } = await supabase.denyAuthorization(authorizationId);
      if (error || !data) throw providerError();
      return { redirectUrl: data.redirect_url ?? '' };
    },
  };
}
