import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminUserInput } from './admin-users.js';

test('admin invitations always create employees', () => {
  assert.deepEqual(normalizeAdminUserInput({
    name: '  Rohan   Verma ',
    email: 'ROHAN@EXAMPLE.COM',
    role: 'admin'
  }), {
    name: 'Rohan Verma',
    email: 'rohan@example.com',
    role: 'employee'
  });
});

test('admin invitations reject missing or malformed input', () => {
  assert.throws(() => normalizeAdminUserInput({ email: 'rohan@example.com' }), /Name is required/);
  assert.throws(() => normalizeAdminUserInput({ name: 'Rohan', email: 'not-an-email' }), /Valid email is required/);
});
