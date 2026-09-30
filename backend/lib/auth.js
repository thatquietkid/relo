import { createClient } from '@supabase/supabase-js';
import { json, corsHeaders } from './http.js';
import { ServiceUnavailableError } from './errors.js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Returns a Supabase client configured for public/user requests.
 * @param {string} [accessToken]
 */
export function publicClient(accessToken) {
  if (!supabaseUrl || !supabaseKey) {
    throw new ServiceUnavailableError('Supabase is not configured');
  }
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined
  });
}

/**
 * Returns a Supabase client with admin privileges.
 */
export function adminClient() {
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new ServiceUnavailableError('Supabase admin provisioning is not configured');
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

/**
 * Extracts Bearer token from authorization header.
 * @param {import('node:http').IncomingMessage} req
 * @returns {string}
 */
export function tokenFrom(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

/**
 * Resolves currently authenticated user from request authorization header.
 * @param {import('node:http').IncomingMessage | { headers: Record<string, string> }} req
 * @returns {Promise<{id: string, email: string, name: string, role: string, organizationId: string | null} | null>}
 */
export async function currentUser(req) {
  const token = tokenFrom(req);
  if (!token) return null;
  const supabase = publicClient(token);
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, organization_id')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (!profile) return null;

  return {
    id: authData.user.id,
    email: profile?.email || authData.user.email,
    name: profile?.full_name || authData.user.email?.split('@')[0] || 'Relo user',
    role: profile?.role || 'employee',
    organizationId: profile?.organization_id || null
  };
}

/**
 * Enforces role authorization. Responds with error if unauthorized.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {string[]} roles
 * @returns {Promise<{user: any, client: any} | null>}
 */
export async function requireRole(req, res, roles) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, {
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    }, corsHeaders());
    return null;
  }
  if (!roles.includes(user.role)) {
    json(res, 403, {
      error: {
        code: 'FORBIDDEN',
        message: 'Insufficient role for this resource'
      }
    }, corsHeaders());
    return null;
  }
  return { user, client: publicClient(tokenFrom(req)) };
}
