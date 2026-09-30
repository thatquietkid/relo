import { PayloadTooLargeError, BadRequestError } from './errors.js';

export const MAX_BODY_BYTES = 64 * 1024;

/**
 * Sends a JSON response with status code and standard headers.
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {any} payload
 * @param {Record<string, string>} [extraHeaders={}]
 */
export function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(payload));
}

/**
 * Returns CORS headers matching origin configuration.
 * @returns {Record<string, string>}
 */
export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': process.env.FRONTEND_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
    'Vary': 'Origin'
  };
}

/**
 * Handles CORS preflight OPTIONS requests.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @returns {boolean} True if request was handled
 */
export function handleCorsPreflight(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return true;
  }
  return false;
}

/**
 * Reads and parses incoming request body as JSON.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [maxBytes=MAX_BODY_BYTES]
 * @returns {Promise<any>}
 */
export function readJson(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBytes) {
        reject(new PayloadTooLargeError('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new BadRequestError('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Returns frontend base URL for redirect callbacks.
 * @returns {string}
 */
export function redirectUrl() {
  return process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:4173';
}

/**
 * Normalizes email address to lower case trimmed string.
 * @param {string | unknown} value
 * @returns {string}
 */
export function normalizedEmail(value) {
  return String(value || '').trim().toLowerCase();
}
