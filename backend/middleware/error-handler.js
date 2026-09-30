import crypto from 'node:crypto';
import { json, corsHeaders } from '../lib/http.js';
import { AppError } from '../lib/errors.js';

/**
 * Formats and sends a structured error response.
 * @param {Error | AppError | any} err
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 */
export function handleError(err, req, res) {
  if (res.headersSent) {
    res.destroy();
    return;
  }

  const requestId = req.headers['x-request-id'] || `req_${crypto.randomBytes(6).toString('hex')}`;
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred. Please try again.';
  let details = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    if (err.details && err.details.length > 0) {
      details = err.details;
    }
  } else if (err.statusCode || err.status) {
    statusCode = err.statusCode || err.status;
    message = err.message || message;
    if (statusCode === 400) code = 'BAD_REQUEST';
    else if (statusCode === 401) code = 'UNAUTHORIZED';
    else if (statusCode === 403) code = 'FORBIDDEN';
    else if (statusCode === 404) code = 'NOT_FOUND';
    else if (statusCode === 409) code = 'CONFLICT';
    else if (statusCode === 413) code = 'PAYLOAD_TOO_LARGE';
    else if (statusCode === 422) code = 'VALIDATION_ERROR';
    else if (statusCode === 503) code = 'SERVICE_UNAVAILABLE';
  } else if (err.name === 'SyntaxError') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Malformed JSON in request body';
  }

  // Log 5xx errors to stderr for observability
  if (statusCode >= 500) {
    console.error(`[${new Date().toISOString()}] [${requestId}] Internal Server Error:`, err);
  }

  const errorPayload = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
      requestId
    },
    message
  };

  json(res, statusCode, errorPayload, {
    ...corsHeaders(),
    'X-Request-Id': requestId
  });
}
