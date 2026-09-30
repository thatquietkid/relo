import { json, corsHeaders, readJson, redirectUrl } from '../lib/http.js';
import { requireRole, adminClient } from '../lib/auth.js';
import { BadRequestError } from '../lib/errors.js';
import { isAdminRole, normalizeAdminEventQuery, toAdminEventView } from '../admin-events.js';
import { normalizeAdminUserInput } from '../admin-users.js';

/**
 * Handles /api/admin/* routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {Promise<boolean>} True if route matched
 */
export async function handleAdminRoutes(req, res, url) {
  const headers = corsHeaders();

  if (req.method === 'GET' && url.pathname === '/api/admin/events') {
    const access = await requireRole(req, res, ['admin']);
    if (!access || !isAdminRole(access.user.role)) return true;
    const filters = normalizeAdminEventQuery(url.searchParams);
    let query = access.client
      .from('platform_events')
      .select('id, category, event_name, severity, summary, organization_id, actor_id, occurred_at, properties')
      .order('occurred_at', { ascending: false })
      .limit(filters.limit);
    if (filters.category) query = query.eq('category', filters.category);
    if (filters.severity) query = query.eq('severity', filters.severity);
    const { data: events, error } = await query;
    if (error) throw error;
    json(res, 200, { user: access.user, events: (events || []).map(toAdminEventView) }, headers);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/users') {
    const access = await requireRole(req, res, ['admin']);
    if (!access || !isAdminRole(access.user.role)) return true;
    const input = normalizeAdminUserInput(await readJson(req));
    const { data, error } = await adminClient().auth.admin.inviteUserByEmail(input.email, {
      data: { full_name: input.name },
      redirectTo: redirectUrl()
    });
    if (error || !data.user) {
      throw new BadRequestError(error?.message || 'Unable to invite employee');
    }
    const { error: eventError } = await access.client.from('platform_events').insert({
      category: 'auth',
      event_name: 'employee_invited',
      severity: 'info',
      summary: 'An employee invitation was sent from the admin workspace.',
      actor_id: access.user.id,
      properties: { email: input.email, full_name: input.name }
    });
    if (eventError) throw eventError;
    json(res, 201, {
      invited: true,
      user: { id: data.user.id, email: input.email, name: input.name, role: 'employee' }
    }, headers);
    return true;
  }

  return false;
}
