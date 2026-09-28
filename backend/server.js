import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { isAdminRole, normalizeAdminEventQuery, toAdminEventView } from './admin-events.js';

const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '0.0.0.0';
const maxBodyBytes = 64 * 1024;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin'
  };
}

function publicClient(accessToken) {
  if (!supabaseUrl || !supabaseKey) throw Object.assign(new Error('Supabase is not configured'), { statusCode: 503 });
  return createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined
  });
}

function tokenFrom(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function currentUser(req) {
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
  return {
    id: authData.user.id,
    email: profile?.email || authData.user.email,
    name: profile?.full_name || authData.user.email?.split('@')[0] || 'Relo user',
    role: profile?.role || 'employee',
    organizationId: profile?.organization_id || null
  };
}

async function requireRole(req, res, roles) {
  const user = await currentUser(req);
  if (!user) {
    json(res, 401, { error: 'Authentication required' }, corsHeaders());
    return null;
  }
  if (!roles.includes(user.role)) {
    json(res, 403, { error: 'Insufficient role for this resource' }, corsHeaders());
    return null;
  }
  return { user, client: publicClient(tokenFrom(req)) };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        reject(Object.assign(new Error('Request body too large'), { statusCode: 413 }));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function redirectUrl() {
  return process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:4173';
}

function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const headers = corsHeaders();
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    const input = await readJson(req);
    const { data, error } = await publicClient().auth.signInWithPassword({ email: input.email, password: input.password });
    if (error || !data.session) {
      json(res, 401, { error: error?.message || 'Invalid email or password' }, headers);
      return;
    }
    const user = await currentUser({ headers: { authorization: `Bearer ${data.session.access_token}` } });
    json(res, 200, { token: data.session.access_token, refreshToken: data.session.refresh_token, user }, headers);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/request-otp') {
    const input = await readJson(req);
    const email = normalizedEmail(input.email);
    if (!email) {
      json(res, 400, { error: 'Email is required' }, headers);
      return;
    }
    const { error } = await publicClient().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false }
    });
    if (error) {
      json(res, 400, { error: error.message }, headers);
      return;
    }
    json(res, 202, { accepted: true, delivery: 'supabase-smtp' }, headers);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/verify-otp') {
    const input = await readJson(req);
    const email = normalizedEmail(input.email);
    const token = String(input.token || '').trim();
    if (!email || !/^\d{6}$/.test(token)) {
      json(res, 400, { error: 'Enter the six digit code from your email' }, headers);
      return;
    }
    const { data, error } = await publicClient().auth.verifyOtp({ email, token, type: 'email' });
    if (error || !data.session) {
      json(res, 401, { error: error?.message || 'That code is invalid or expired' }, headers);
      return;
    }
    const user = await currentUser({ headers: { authorization: `Bearer ${data.session.access_token}` } });
    if (!user) {
      json(res, 403, { error: 'No Relo profile is configured for this account' }, headers);
      return;
    }
    json(res, 200, { token: data.session.access_token, refreshToken: data.session.refresh_token, user }, headers);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
    const input = await readJson(req);
    const { data, error } = await publicClient().auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { full_name: input.name || '' }, emailRedirectTo: redirectUrl() }
    });
    if (error) {
      json(res, 400, { error: error.message }, headers);
      return;
    }
    json(res, 202, { accepted: true, requiresEmailConfirmation: !data.session }, headers);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/send-verification') {
    const input = await readJson(req);
    const { error } = await publicClient().auth.resend({ type: 'signup', email: input.email, options: { emailRedirectTo: redirectUrl() } });
    if (error) {
      json(res, 400, { error: error.message }, headers);
      return;
    }
    json(res, 202, { accepted: true, delivery: 'supabase-smtp' }, headers);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/reset-password') {
    const input = await readJson(req);
    const { error } = await publicClient().auth.resetPasswordForEmail(input.email, { redirectTo: redirectUrl() });
    if (error) {
      json(res, 400, { error: error.message }, headers);
      return;
    }
    json(res, 202, { accepted: true, delivery: 'supabase-smtp' }, headers);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await currentUser(req);
    if (!user) {
      json(res, 401, { error: 'Authentication required' }, headers);
      return;
    }
    json(res, 200, { user }, headers);
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    const token = tokenFrom(req);
    if (token) await publicClient(token).auth.signOut();
    json(res, 200, { ok: true }, headers);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/dashboard/employee') {
    const access = await requireRole(req, res, ['employee', 'admin']);
    if (!access) return;
    const { data: cases, error } = await access.client.from('relocation_cases').select('id, status, progress, move_date').eq('employee_id', access.user.id).order('created_at', { ascending: false });
    if (error) throw error;
    json(res, 200, { user: access.user, cases: cases || [], nextAction: 'Compare housing options' }, headers);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/dashboard/hr') {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return;
    const { data: cases, error } = await access.client.from('relocation_cases').select('id, employee_id, status, progress, move_date, organization_id').eq('organization_id', access.user.organizationId).order('created_at', { ascending: false });
    if (error) throw error;
    json(res, 200, { user: access.user, cases: cases || [] }, headers);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/growth/aarrr') {
    const access = await requireRole(req, res, ['hr', 'admin']);
    if (!access) return;
    const { data: rows, error } = await access.client.from('growth_metrics').select('metric_key, display_value, detail, trend').order('metric_key');
    if (error) throw error;
    const metrics = Object.fromEntries((rows || []).map((row) => [row.metric_key, { label: row.metric_key[0].toUpperCase() + row.metric_key.slice(1), value: row.display_value, detail: row.detail, trend: row.trend }]));
    json(res, 200, { user: access.user, metrics, source: 'supabase.growth_metrics' }, headers);
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/events') {
    const access = await requireRole(req, res, ['admin']);
    if (!access || !isAdminRole(access.user.role)) return;
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
    return;
  }
  json(res, 404, { error: 'Not found' }, headers);
}

http.createServer((req, res) => {
  route(req, res).catch((error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    json(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'Internal server error' }, corsHeaders());
  });
}).listen(port, host, () => console.log(`Relo backend running at http://${host}:${port}`));
