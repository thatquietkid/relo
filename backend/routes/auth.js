import { json, corsHeaders, readJson, redirectUrl, normalizedEmail } from '../lib/http.js';
import { publicClient, currentUser, tokenFrom } from '../lib/auth.js';
import { BadRequestError, UnauthorizedError, ForbiddenError } from '../lib/errors.js';

/**
 * Handles /api/auth/* routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {URL} url
 * @returns {Promise<boolean>} True if route matched
 */
export async function handleAuthRoutes(req, res, url) {
  const headers = corsHeaders();

  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await readJson(req);
    const email = normalizedEmail(input.email);
    const password = String(input.password || '');
    if (!email || !password) {
      throw new BadRequestError('Email and password are required');
    }
    const { data, error } = await publicClient().auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      throw new UnauthorizedError(error?.message || 'Invalid email or password');
    }
    const user = await currentUser({ headers: { authorization: `Bearer ${data.session.access_token}` } });
    json(res, 200, { token: data.session.access_token, refreshToken: data.session.refresh_token, user }, headers);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/request-otp') {
    const input = await readJson(req);
    const email = normalizedEmail(input.email);
    if (!email) {
      throw new BadRequestError('Email is required');
    }
    const { error } = await publicClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) {
      throw new BadRequestError(error.message);
    }
    json(res, 202, { accepted: true, delivery: 'supabase-smtp' }, headers);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
    const input = await readJson(req);
    const email = normalizedEmail(input.email);
    const token = String(input.token || '').trim();
    if (!email || !/^\d{6}$/.test(token)) {
      throw new BadRequestError('Enter the six digit code from your email');
    }
    const { data, error } = await publicClient().auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.session) {
      throw new UnauthorizedError(error?.message || 'That code is invalid or expired');
    }
    const user = await currentUser({ headers: { authorization: `Bearer ${data.session.access_token}` } });
    if (!user) {
      throw new ForbiddenError('No Relo profile is configured for this account');
    }
    json(res, 200, { token: data.session.access_token, refreshToken: data.session.refresh_token, user }, headers);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    throw new ForbiddenError('Self-service registration is disabled. Ask an administrator for an invitation.');
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/send-verification') {
    throw new ForbiddenError('Self-service registration is disabled. Ask an administrator for an invitation.');
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const input = await readJson(req);
    const email = normalizedEmail(input.email);
    if (!email) {
      throw new BadRequestError('Email is required to reset password');
    }
    const { error } = await publicClient().auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() });
    if (error) {
      throw new BadRequestError(error.message);
    }
    json(res, 202, { accepted: true, delivery: 'supabase-smtp' }, headers);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await currentUser(req);
    if (!user) {
      throw new UnauthorizedError('Authentication required');
    }
    json(res, 200, { user }, headers);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = tokenFrom(req);
    if (token) await publicClient(token).auth.signOut();
    json(res, 200, { ok: true }, headers);
    return true;
  }

  return false;
}
