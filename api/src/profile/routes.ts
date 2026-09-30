import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { makeAuthorizationHooks, type AuthorizationDependencies } from '../authorization/require-auth.js';
import { createSupabaseClient, type SupabaseClientConfig } from '../identity/supabase.js';
import type { IdentityContext } from '../identity/types.js';
import { ApiError } from '../shared/errors.js';
import { parseJsonBody } from '../shared/validation.js';

type ProfilePatch = {
  fullName?: string;
  phone?: string;
  bio?: string;
  department?: string;
  jobTitle?: string;
  preferences?: { notificationsEmail?: boolean; notificationsInApp?: boolean; theme?: string; shareContact?: boolean };
};

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  organization_id: string | null;
  phone: string | null;
  bio: string | null;
  department: string | null;
  job_title: string | null;
  preferences: ProfilePatch['preferences'] | null;
}

export interface ProfileRepository {
  get(userId: string): Promise<ProfileRow | null>;
  update(userId: string, patch: ProfilePatch): Promise<ProfileRow>;
}

export interface ProfileRouteDependencies extends AuthorizationDependencies {
  profileRepository?: ProfileRepository;
  createProfileRepository?: (accessToken: string) => ProfileRepository;
}

function makeProfileRepository(config: SupabaseClientConfig): ProfileRepository {
  const client = createSupabaseClient(config);
  return {
    async get(userId) {
      const result = await client.from('profiles').select('id, email, full_name, role, organization_id, phone, bio, department, job_title, preferences').eq('id', userId).maybeSingle();
      if (result.error) throw new ApiError(503, 'PROFILE_DATA_UNAVAILABLE', 'Profile data is unavailable.');
      return result.data as ProfileRow | null;
    },
    async update(userId, patch) {
      const updates: Record<string, unknown> = { id: userId };
      if (patch.fullName !== undefined) updates.full_name = patch.fullName;
      if (patch.phone !== undefined) updates.phone = patch.phone;
      if (patch.bio !== undefined) updates.bio = patch.bio;
      if (patch.department !== undefined) updates.department = patch.department;
      if (patch.jobTitle !== undefined) updates.job_title = patch.jobTitle;
      if (patch.preferences !== undefined) updates.preferences = patch.preferences;
      const result = await client.from('profiles').upsert(updates).select('id, email, full_name, role, organization_id, phone, bio, department, job_title, preferences').single();
      if (result.error || !result.data) throw new ApiError(503, 'PROFILE_DATA_UNAVAILABLE', 'Profile data could not be saved.');
      return result.data as ProfileRow;
    },
  };
}

function bearerToken(request: FastifyRequest): string {
  const value = request.headers.authorization;
  return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

function identityForRequest(request: FastifyRequest): IdentityContext {
  const context = request.relo;
  if (!context) throw new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required.');
  return context.membership ? { ...context.identity, memberships: [context.membership] } : context.identity;
}

function repositoryForRequest(deps: ProfileRouteDependencies, request: FastifyRequest): ProfileRepository {
  if (deps.profileRepository) return deps.profileRepository;
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const accessToken = bearerToken(request);
  if (!url || !publishableKey || !accessToken) throw new ApiError(503, 'PROFILE_DATA_UNAVAILABLE', 'Profile data is unavailable.');
  try {
    return (deps.createProfileRepository ?? ((token) => makeProfileRepository({ url, publishableKey, accessToken: token })))(accessToken);
  } catch {
    throw new ApiError(503, 'PROFILE_DATA_UNAVAILABLE', 'Profile data is unavailable.');
  }
}

function profileView(identity: IdentityContext, row: ProfileRow | null) {
  const membership = identity.memberships.find((item) => item.status === 'active');
  return {
    id: identity.user.id,
    email: row?.email || identity.user.email || '',
    fullName: row?.full_name || identity.user.email?.split('@')[0] || '',
    role: row?.role || membership?.roles[0]?.key || (identity.platformScope ? 'platform_admin' : 'employee'),
    organizationId: row?.organization_id || membership?.tenant_id || null,
    phone: row?.phone || '',
    bio: row?.bio || '',
    department: row?.department || '',
    jobTitle: row?.job_title || '',
    preferences: row?.preferences || { notificationsEmail: true, notificationsInApp: true, theme: 'dark' },
  };
}

const preferences = z.object({
  notificationsEmail: z.boolean().optional(),
  notificationsInApp: z.boolean().optional(),
  theme: z.string().trim().max(40).optional(),
  shareContact: z.boolean().optional(),
});
const profilePatch = z.object({
  fullName: z.string().trim().min(2).max(200).optional(),
  phone: z.string().trim().max(80).optional(),
  bio: z.string().trim().max(2000).optional(),
  department: z.string().trim().max(200).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  preferences: preferences.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one profile field is required.');

export function registerProfileRoutes(app: FastifyInstance, deps: ProfileRouteDependencies = {}): void {
  const hooks = makeAuthorizationHooks({ authService: deps.authService, createSupabasePort: deps.createSupabasePort });
  app.get('/api/profile', { preHandler: hooks.requireAuth }, async (request) => {
    const identity = identityForRequest(request);
    const row = await repositoryForRequest(deps, request).get(identity.user.id);
    return { profile: profileView(identity, row) };
  });

  app.patch('/api/profile', { preHandler: hooks.requireAuth }, async (request) => {
    const input = parseJsonBody(profilePatch, request.body) as ProfilePatch;
    const identity = identityForRequest(request);
    const row = await repositoryForRequest(deps, request).update(identity.user.id, input);
    return { profile: profileView(identity, row), message: 'Profile updated successfully' };
  });
}
