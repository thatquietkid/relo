import http from 'node:http';
import { handleCorsPreflight, json, corsHeaders } from './lib/http.js';
import { handleError } from './middleware/error-handler.js';
import { NotFoundError } from './lib/errors.js';
import { handleAuthRoutes } from './routes/auth.js';
import { handleOAuthRoutes } from './routes/oauth.js';
import { handleDashboardRoutes } from './routes/dashboard.js';
import { handleAdminRoutes } from './routes/admin.js';
import { handleProfileRoutes } from './routes/profile.js';
import { handleHrRoutes } from './routes/hr.js';

const port = Number(process.env.PORT || 4100);
const host = process.env.HOST || '0.0.0.0';

/**
 * Main application request router.
 * Dispatches requests to modular domain handlers.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export async function router(req, res) {
  // CORS Preflight
  if (handleCorsPreflight(req, res)) return;

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Liveness / health check
  if (req.method === 'GET' && url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }

  // Domain route handlers
  if (await handleAuthRoutes(req, res, url)) return;
  if (await handleOAuthRoutes(req, res, url)) return;
  if (await handleDashboardRoutes(req, res, url)) return;
  if (await handleAdminRoutes(req, res, url)) return;
  if (await handleProfileRoutes(req, res, url)) return;
  if (await handleHrRoutes(req, res, url)) return;

  // No route matched: 404 Not Found
  throw new NotFoundError(`Endpoint ${req.method} ${url.pathname} not found`);
}

/**
 * Creates and starts the HTTP server.
 */
export function createServer() {
  return http.createServer((req, res) => {
    router(req, res).catch((error) => {
      handleError(error, req, res);
    });
  });
}

// Start listener when executed directly
const server = createServer();
if (process.env.NODE_ENV !== 'test') {
  server.listen(port, host, () => {
    console.log(`Relo backend running at http://${host}:${port}`);
  });
}

export default server;
