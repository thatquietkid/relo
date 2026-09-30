/**
 * Custom application error hierarchy for Relo backend.
 * Provides consistent error codes and HTTP status codes across all API endpoints.
 */

export class AppError extends Error {
  /**
   * @param {string} message - Human readable error explanation
   * @param {number} [statusCode=500] - HTTP status code
   * @param {string} [code='INTERNAL_ERROR'] - Error code identifier
   * @param {Array<{field?: string, message: string}>} [details=[]] - Optional field-level validation details
   */
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = []) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details = []) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = []) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions for this resource') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(message = 'Request body too large') {
    super(message, 413, 'PAYLOAD_TOO_LARGE');
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}
