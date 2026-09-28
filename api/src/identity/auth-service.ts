import { ApiError } from '../shared/errors.js';
import type { IdentityContext } from './types.js';
import type { SupabaseAuthPort, SupabaseSession } from './supabase.js';

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

export interface AuthService {
  requestEmailOtp(email: string): Promise<{ accepted: true }>;
  verifyEmailOtp(email: string, token: string): Promise<SessionResult>;
  getGoogleSignInUrl(redirectTo: string): Promise<string>;
  getCurrentIdentity(accessToken: string): Promise<IdentityContext>;
  logout(accessToken: string): Promise<{ signedOut: true }>;
}

interface AuthServiceOptions {
  supabase: SupabaseAuthPort;
  frontendOrigin?: string;
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

function isAllowedRedirect(redirectTo: string, frontendOrigin: string): boolean {
  try {
    const target = new URL(redirectTo);
    const origin = new URL(frontendOrigin);
    return target.origin === origin.origin;
  } catch {
    return false;
  }
}

export function makeAuthService({ supabase, frontendOrigin = process.env.FRONTEND_ORIGIN ?? 'http://127.0.0.1:4173' }: AuthServiceOptions): AuthService {
  return {
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
      const identity: IdentityContext = {
        user,
        memberships: await supabase.getActiveMemberships(user.id),
      };
      return { session: toSession(data.session), identity };
    },

    async getGoogleSignInUrl(redirectTo) {
      if (!isAllowedRedirect(redirectTo, frontendOrigin)) {
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
      };
    },

    async logout(accessToken) {
      if (!accessToken.trim()) throw authRequired();
      const { error } = await supabase.auth.signOut();
      if (error) throw new ApiError(502, 'AUTH_PROVIDER_ERROR', 'Unable to sign out.');
      return { signedOut: true };
    },
  };
}
