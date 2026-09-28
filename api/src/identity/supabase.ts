import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MembershipView } from '../tenancy/types.js';

export interface SupabaseError {
  code?: string;
  message: string;
  status?: number;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number | null;
  expires_in?: number | null;
  token_type?: string | null;
}

export interface SupabaseAuthPort {
  auth: {
    signInWithOtp(input: {
      email: string;
      options: { shouldCreateUser: false };
    }): Promise<{ data: unknown; error: SupabaseError | null }>;
    verifyOtp(input: {
      email: string;
      token: string;
      type: 'email';
    }): Promise<{
      data: { session: SupabaseSession | null; user: { id: string; email?: string | null } | null };
      error: SupabaseError | null;
    }>;
    getUser(accessToken: string): Promise<{
      data: { user: { id: string; email?: string | null } | null };
      error: SupabaseError | null;
    }>;
    signInWithOAuth(input: {
      provider: 'google';
      options: { redirectTo: string };
    }): Promise<{ data: { url: string | null }; error: SupabaseError | null }>;
    signOut(): Promise<{ error: SupabaseError | null }>;
  };
  getActiveMemberships(userId: string): Promise<MembershipView[]>;
}

export interface SupabaseInvitationPort {
  acceptInvitation(userId: string, rawToken: string): Promise<{
    data: MembershipView | null;
    error: SupabaseError | null;
  }>;
}

export interface SupabaseOAuthPort {
  getAuthorizationDetails(authorizationId: string): Promise<{
    data: Record<string, unknown> | null;
    error: SupabaseError | null;
  }>;
  approveAuthorization(authorizationId: string): Promise<{
    data: { redirect_url?: string | null } | null;
    error: SupabaseError | null;
  }>;
  denyAuthorization(authorizationId: string): Promise<{
    data: { redirect_url?: string | null } | null;
    error: SupabaseError | null;
  }>;
}

export type SupabasePort = SupabaseAuthPort & SupabaseInvitationPort & SupabaseOAuthPort;

export interface SupabaseClientConfig {
  url: string;
  publishableKey: string;
  accessToken?: string;
}

export function createSupabaseClient(config: SupabaseClientConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    ...(config.accessToken
      ? { global: { headers: { Authorization: `Bearer ${config.accessToken}` } } }
      : {}),
  });
}

function mapMembership(row: Record<string, unknown>): MembershipView {
  const rawRoles = Array.isArray(row.roles)
    ? row.roles
    : Array.isArray(row.membership_roles)
      ? row.membership_roles.map((value) => (value as Record<string, unknown>).role)
      : [];
  const rawTenant = (row.tenant ?? row.tenants ?? {}) as Record<string, unknown>;

  return {
    id: String(row.id),
    tenant_id: String(row.tenant_id),
    user_id: String(row.user_id),
    status: row.status as MembershipView['status'],
    joined_at: String(row.joined_at),
    suspended_at: (row.suspended_at as string | null) ?? null,
    tenant: {
      id: String(rawTenant.id),
      name: String(rawTenant.name),
      slug: String(rawTenant.slug),
      status: rawTenant.status as MembershipView['tenant']['status'],
    },
    roles: rawRoles.filter(Boolean).map((role) => {
      const value = role as Record<string, unknown>;
      return { id: String(value.id), key: String(value.key) };
    }),
  };
}

export function createSupabasePort(client: SupabaseClient): SupabasePort {
  return {
    auth: {
      signInWithOtp: (input) => client.auth.signInWithOtp(input),
      verifyOtp: (input) => client.auth.verifyOtp(input),
      getUser: (accessToken) => client.auth.getUser(accessToken),
      signInWithOAuth: (input) => client.auth.signInWithOAuth(input),
      signOut: () => client.auth.signOut(),
    },
    async getActiveMemberships(userId) {
      const { data, error } = await client
        .from('memberships')
        .select('id, tenant_id, user_id, status, joined_at, suspended_at, tenant:tenants(id, name, slug, status), membership_roles(role:roles(id, key))')
        .eq('user_id', userId)
        .eq('status', 'active');
      if (error) throw error;
      return (data ?? []).map((row) => mapMembership(row as Record<string, unknown>));
    },
    async acceptInvitation(userId, rawToken) {
      const { data, error } = await client.rpc('accept_invitation', {
        p_user_id: userId,
        p_raw_token: rawToken,
      });
      return {
        data: data ? mapMembership(data as Record<string, unknown>) : null,
        error,
      };
    },
    async getAuthorizationDetails(authorizationId) {
      return client.auth.oauth.getAuthorizationDetails(authorizationId);
    },
    async approveAuthorization(authorizationId) {
      return client.auth.oauth.approveAuthorization(authorizationId);
    },
    async denyAuthorization(authorizationId) {
      return client.auth.oauth.denyAuthorization(authorizationId);
    },
  };
}

export function createSupabasePortFromEnv(accessToken?: string): SupabasePort {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error('Supabase is not configured');
  }
  return createSupabasePort(createSupabaseClient({ url, publishableKey, accessToken }));
}
