import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from '../identity/types.js';
import type { SupabaseOAuthPort } from '../identity/supabase.js';

export interface AuthorizationDetails {
  authorization_id: string;
  client: { name: string; uri?: string };
  redirect_uri?: string;
  scope?: string;
}

export interface ConsentService {
  getAuthorizationDetails(identity: IdentityContext | null, authorizationId: string): Promise<AuthorizationDetails>;
  approveAuthorization(identity: IdentityContext | null, authorizationId: string): Promise<{ redirectUrl: string }>;
  denyAuthorization(identity: IdentityContext | null, authorizationId: string): Promise<{ redirectUrl: string }>;
}

interface ConsentServiceOptions {
  supabase: SupabaseOAuthPort;
}

function requireIdentity(identity: IdentityContext | null): asserts identity is IdentityContext {
  if (!identity) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
}

function requireAuthorizationId(authorizationId: string): void {
  if (!authorizationId.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'authorization_id is required.');
}

function providerError(): ApiError {
  return new ApiError(400, 'OAUTH_CONSENT_ERROR', 'The OAuth authorization request is invalid or expired.');
}

function toDetails(value: Record<string, unknown> | null): AuthorizationDetails {
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
