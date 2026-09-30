import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError, NotFoundError, ValidationError, BadRequestError } from './lib/errors.js';
import { normalizedEmail, corsHeaders } from './lib/http.js';
import { handleCorsPreflight } from './lib/http.js';

test('AppError creates consistent structured error hierarchy', () => {
  const err = new ValidationError('Invalid property data', [{ field: 'title', message: 'Title is required' }]);
  assert.equal(err.statusCode, 422);
  assert.equal(err.code, 'VALIDATION_ERROR');
  assert.equal(err.message, 'Invalid property data');
  assert.equal(err.details.length, 1);
  assert.equal(err.details[0].field, 'title');

  const notFound = new NotFoundError('Cohort not found');
  assert.equal(notFound.statusCode, 404);
  assert.equal(notFound.code, 'NOT_FOUND');

  const badReq = new BadRequestError('Email required');
  assert.equal(badReq.statusCode, 400);
  assert.equal(badReq.code, 'BAD_REQUEST');
});

test('HTTP utilities normalize inputs correctly', () => {
  assert.equal(normalizedEmail('  John.DOE@Example.COM  '), 'john.doe@example.com');
  assert.equal(normalizedEmail(''), '');
  assert.equal(normalizedEmail(null), '');

  const cors = corsHeaders();
  assert.equal(cors['Access-Control-Allow-Headers'], 'Content-Type, Authorization');
  assert.match(cors['Access-Control-Allow-Methods'], /GET.*POST.*PATCH.*DELETE.*OPTIONS/);
});

test('handleCorsPreflight responds with 204 on OPTIONS', () => {
  let status = 0;
  let headers = {};
  let ended = false;

  const mockRes = {
    writeHead(s, h) {
      status = s;
      headers = h;
    },
    end() {
      ended = true;
    }
  };

  const isOptions = handleCorsPreflight({ method: 'OPTIONS' }, mockRes);
  assert.equal(isOptions, true);
  assert.equal(status, 204);
  assert.equal(ended, true);

  const isGet = handleCorsPreflight({ method: 'GET' }, mockRes);
  assert.equal(isGet, false);
});
