import { json, corsHeaders } from '../lib/http.js';
import { requireRole } from '../lib/auth.js';

/**
 * Handles /api/dashboard/* and /api/growth/* routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {Promise<boolean>} True if route matched
 */
export async function handleDashboardRoutes(req, res, url) {
  const headers = corsHeaders();

  if (req.method === 'GET' && url.pathname === '/api/dashboard/employee') {
    const access = await requireRole(req, res, ['employee', 'admin']);
    if (!access) return true;
    const { data: cases, error } = await access.client
      .from('relocation_cases')
      .select('id, status, progress, move_date')
      .eq('employee_id', access.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    json(res, 200, { user: access.user, cases: cases || [], nextAction: 'Compare housing options' }, headers);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/dashboard/hr') {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return true;
    const { data: cases, error } = await access.client
      .from('relocation_cases')
      .select('id, employee_id, status, progress, move_date, organization_id')
      .eq('organization_id', access.user.organizationId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    json(res, 200, { user: access.user, cases: cases || [] }, headers);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/growth/aarrr') {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return true;
    const { data: rows, error } = await access.client
      .from('growth_metrics')
      .select('metric_key, display_value, detail, trend')
      .order('metric_key');
    if (error) throw error;
    const metrics = Object.fromEntries(
      (rows || []).map((row) => [
        row.metric_key,
        {
          label: row.metric_key[0].toUpperCase() + row.metric_key.slice(1),
          value: row.display_value,
          detail: row.detail,
          trend: row.trend
        }
      ])
    );
    json(res, 200, { user: access.user, metrics, source: 'supabase.growth_metrics' }, headers);
    return true;
  }

  return false;
}
