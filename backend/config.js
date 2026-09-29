export function loadSupabaseConfig(env = process.env, { requireServiceRole = true } = {}) {
  const url = String(env.SUPABASE_URL || '').trim();
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url) throw new Error('SUPABASE_URL is required');
  if (!publishableKey) throw new Error('SUPABASE_PUBLISHABLE_KEY is required');
  if (requireServiceRole && !serviceRoleKey) {
    throw Object.assign(
      new Error('SUPABASE_SERVICE_ROLE_KEY is required for employee invitations'),
      { statusCode: 503 }
    );
  }

  return { url, publishableKey, serviceRoleKey };
}
