import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from './types.js';
import type { SupabaseAuthPort, SupabaseSession } from './supabase.js';
import { PERMISSIONS } from '../authorization/policy.js';

export interface SafeSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  expiresIn: number | null;
  tokenType: string;
}

export interface SessionResult {
  session: SafeSession;
  identity: IdentityContext;
}

export type DemoPortal = 'employee' | 'hr' | 'admin';

export interface AuthService {
  requestEmailOtp(email: string): Promise<{ accepted: true }>;
  verifyEmailOtp(email: string, token: string): Promise<SessionResult>;
  signInDemo?(portal: DemoPortal): Promise<SessionResult>;
  getGoogleSignInUrl(redirectTo: string): Promise<string>;
  getCurrentIdentity(accessToken: string): Promise<IdentityContext>;
  logout(accessToken: string): Promise<{ signedOut: true }>;
}

interface AuthServiceOptions {
  supabase: SupabaseAuthPort;
  createSupabasePort?: (accessToken?: string) => SupabaseAuthPort;
  frontendOrigin?: string;
  googleRedirectAllowlist?: string[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function authRequired(): ApiError {
  return new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
}

function toSession(session: SupabaseSession): SafeSession {
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt: session.expires_at ?? null,
    expiresIn: session.expires_in ?? null,
    tokenType: session.token_type ?? 'bearer',
  };
}

function configuredRedirects(frontendOrigin: string, configured?: string[]): string[] {
  if (configured?.length) return configured;
  const fromEnvironment = process.env.GOOGLE_AUTH_REDIRECT_ALLOWLIST
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (fromEnvironment?.length) return fromEnvironment;
  return [`${frontendOrigin.replace(/\/$/, '')}/auth/callback`];
}

function isAllowedRedirect(redirectTo: string, allowedRedirects: string[]): boolean {
  try {
    const target = new URL(redirectTo);
    return allowedRedirects.some((allowed) => target.href === new URL(allowed).href);
  } catch {
    return false;
  }
}

async function platformAuthorization(supabase: SupabaseAuthPort): Promise<Pick<IdentityContext, 'platformScope' | 'platformRoles' | 'platformAuthorization'>> {
  const isPlatformAdmin = await supabase.isPlatformAdmin?.() ?? false;
  if (!isPlatformAdmin) return {};
  return {
    platformScope: true,
    platformRoles: ['platform_admin'],
    platformAuthorization: {
      scope: 'platform',
      roles: ['platform_admin'],
      permissions: [
        PERMISSIONS.PLATFORM_TENANTS_MANAGE,
        PERMISSIONS.PLATFORM_ROLES_MANAGE,
        PERMISSIONS.PLATFORM_SECURITY_MANAGE,
        PERMISSIONS.PLATFORM_AUDIT_READ,
        PERMISSIONS.PLATFORM_HEALTH_READ,
        PERMISSIONS.PLATFORM_FEATURE_FLAGS_MANAGE,
      ],
    },
  };
}

export function makeAuthService({
  supabase,
  createSupabasePort,
  frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:4173',
  googleRedirectAllowlist,
}: AuthServiceOptions): AuthService {
  const allowedRedirects = configuredRedirects(frontendOrigin, googleRedirectAllowlist);
  return {
    async signInDemo(portal) {
      const prefix = `RELO_DEMO_${portal.toUpperCase()}`;
      const email = process.env[`${prefix}_EMAIL`]?.trim();
      const password = process.env[`${prefix}_PASSWORD`]?.trim();
      if (!email || !password) {
        throw new ApiError(503, 'DEMO_ACCESS_NOT_CONFIGURED', 'Demo access is not configured for this environment.');
      }

      if (!supabase.auth.signInWithPassword) {
        throw new ApiError(503, 'DEMO_ACCESS_NOT_CONFIGURED', 'Demo access is not configured for this environment.');
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) {
        throw new ApiError(401, 'DEMO_SIGN_IN_FAILED', 'The demo portal could not be opened.');
      }

      const authenticatedSupabase = createSupabasePort?.(data.session.access_token) ?? supabase;
      const identity: IdentityContext = {
        user: { id: data.user.id, email: data.user.email ?? email },
        memberships: await authenticatedSupabase.getActiveMemberships(data.user.id),
      };
      if (identity.memberships[0]?.roles[0]?.key !== portal) {
        throw new ApiError(403, 'DEMO_PORTAL_ROLE_MISMATCH', 'The configured demo account is not assigned to this portal.');
      }

      return { session: toSession(data.session), identity };
    },

    async requestEmailOtp(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Email is required.');
      }
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { shouldCreateUser: false },
      });
      if (error) {
        throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'Unable to request an email code.');
      }
      return { accepted: true };
    },

    async verifyEmailOtp(email, token) {
      const normalized = normalizeEmail(email);
      if (!normalized || !/^\d{6}$/.test(token.trim())) {
        throw new ApiError(401, 'INVALID_OTP', 'The email code is invalid or expired.');
      }
      const { data, error } = await supabase.auth.verifyOtp({
        email: normalized,
        token: token.trim(),
        type: 'email',
      });
      if (error || !data.session || !data.user) {
        throw new ApiError(401, 'INVALID_OTP', 'The email code is invalid or expired.');
      }
      const user = { id: data.user.id, email: data.user.email ?? normalized };
      const authenticatedSupabase = createSupabasePort?.(data.session.access_token) ?? supabase;
      const identity: IdentityContext = {
        user,
        memberships: await authenticatedSupabase.getActiveMemberships(user.id),
      };
      return { session: toSession(data.session), identity };
    },

    async getGoogleSignInUrl(redirectTo) {
      if (!isAllowedRedirect(redirectTo, allowedRedirects)) {
        throw new ApiError(400, 'REDIRECT_NOT_ALLOWED', 'The redirect target is not allowed.');
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (error || !data.url) {
        throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'Unable to start Google sign-in.');
      }
      return data.url;
    },

    async getCurrentIdentity(accessToken) {
      if (!accessToken.trim()) throw authRequired();
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error || !data.user) throw authRequired();
      return {
        user: { id: data.user.id, email: data.user.email ?? null },
        memberships: await supabase.getActiveMemberships(data.user.id),
        ...(await platformAuthorization(supabase)),
      };
    },

    async logout(accessToken) {
      if (!accessToken.trim()) throw authRequired();
      const { error } = await supabase.auth.signOut(accessToken);
      if (error) throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'Unable to sign out.');
      return { signedOut: true };
    },
  };
}
