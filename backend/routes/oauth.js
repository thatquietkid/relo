import { json, corsHeaders, readJson } from '../lib/http.js';
import { requireRole } from '../lib/auth.js';
import { BadRequestError } from '../lib/errors.js';

/**
 * Handles /api/oauth/* routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {Promise<boolean>} True if route matched
 */
export async function handleOAuthRoutes(req, res, url) {
  const headers = corsHeaders();

  if (req.method === 'GET' && url.pathname === '/api/oauth/authorization-details') {
    const access = await requireRole(req, res, ['employee', 'admin', 'hr']);
    if (!access) return true;
    const authorizationId = String(url.searchParams.get('authorization_id') || '').trim();
    if (!authorizationId) {
      throw new BadRequestError('authorization_id query parameter is required');
    }
    const { data, error } = await access.client.auth.oauth.getAuthorizationDetails(authorizationId);
    if (error) {
      throw new BadRequestError(error.message);
    }
    json(res, 200, { authorization: data }, headers);
    return true;
  }

  if (req.method === 'POST' && (url.pathname === '/api/oauth/approve' || url.pathname === '/api/oauth/deny')) {
    const access = await requireRole(req, res, ['employee', 'admin', 'hr']);
    if (!access) return true;
    const input = await readJson(req);
    const authorizationId = String(input.authorizationId || '').trim();
    if (!authorizationId) {
      throw new BadRequestError('authorizationId is required');
    }
    const method = url.pathname.endsWith('/approve')
      ? access.client.auth.oauth.approveAuthorization.bind(access.client.auth.oauth)
      : access.client.auth.oauth.denyAuthorization.bind(access.client.auth.oauth);
    const { data, error } = await method(authorizationId);
    if (error) {
      throw new BadRequestError(error.message);
    }
    json(res, 200, { redirectUrl: data?.redirect_url || '' }, headers);
    return true;
  }

  return false;
}
